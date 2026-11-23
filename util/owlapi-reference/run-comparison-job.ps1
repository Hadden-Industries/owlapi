param(
    [Parameter(Mandatory=$true)][string] $NodeExecutable,
    [Parameter(Mandatory=$true)][string] $Worker,
    [Parameter(Mandatory=$true)][string] $RequestFile,
    [int] $ParentProcessId,
    [ValidateRange(256, 65536)][int] $BudgetMiB = 3072,
    [ValidateRange(0, 65535)][int] $NodeHeapMiB = 0,
    [ValidateRange(0, 86400)][int] $MaxSeconds = 0,
    [switch] $ExposeGc
)

$ErrorActionPreference = 'Stop'
if (![Environment]::Is64BitProcess) { throw 'Comparison memory protection requires 64-bit PowerShell.' }
foreach ($file in @($NodeExecutable, $Worker, $RequestFile)) {
    if (![IO.Path]::IsPathRooted($file) -or ![IO.File]::Exists($file) -or $file.Contains('"')) {
        throw 'Comparison memory protection requires ordinary absolute executable and input paths.'
    }
}

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static class OwlApiComparisonJob {
    // Keep the handle live for the lifetime of this launcher. It must never be
    // inherited by a worker, so a launcher exit also terminates its descendants.
    private static SafeFileHandle job;
    private static Mutex admission;
    private static ulong reserve;

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatus {
        public uint Length, MemoryLoad;
        public ulong TotalPhysical, AvailablePhysical, TotalPageFile, AvailablePageFile;
        public ulong TotalVirtual, AvailableVirtual, ExtendedVirtual;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters {
        public ulong ReadOperations, WriteOperations, OtherOperations;
        public ulong ReadBytes, WriteBytes, OtherBytes;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatus memory);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern SafeFileHandle CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(SafeFileHandle handle, int kind,
        ref ExtendedLimits limits, uint length);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(SafeFileHandle handle, IntPtr process);

    public static void Admit(int budgetMiB) {
        admission = new Mutex(false, @"Local\OwlApiComparisonMemoryAdmission");
        bool acquired;
        try {
            acquired = admission.WaitOne(0);
        } catch (AbandonedMutexException) {
            acquired = true;
        }
        if (!acquired) throw new InvalidOperationException("An OwlAPI comparison is already using the test memory budget.");

        var memory = ReadMemory();
        const ulong MiB = 1024UL * 1024;
        var budget = (ulong)budgetMiB * MiB;
        reserve = Math.Max(2048UL * MiB, Math.Min(6144UL * MiB, memory.TotalPhysical / 5));
        if (memory.AvailablePhysical < budget + reserve || memory.AvailablePageFile < budget + reserve) {
            throw new InvalidOperationException(String.Format(
                "Comparison memory admission refused: available RAM {0} MiB, commit headroom {1} MiB, required {2} MiB.",
                memory.AvailablePhysical / MiB, memory.AvailablePageFile / MiB, (budget + reserve) / MiB));
        }

        var handle = CreateJobObject(IntPtr.Zero, null);
        if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
        var limits = new ExtendedLimits {
            Basic = new BasicLimits { Flags = 0x00000200 | 0x00002000 },
            JobMemory = new UIntPtr(budget)
        };
        if (!SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))) ||
            !AssignProcessToJobObject(handle, GetCurrentProcess())) {
            var error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw new Win32Exception(error, "The comparison process tree could not enter its Windows memory job.");
        }
        job = handle;
    }

    private static MemoryStatus ReadMemory() {
        var memory = new MemoryStatus { Length = (uint)Marshal.SizeOf(typeof(MemoryStatus)) };
        if (!GlobalMemoryStatusEx(ref memory)) throw new Win32Exception(Marshal.GetLastWin32Error());
        return memory;
    }

    public static void CheckReserve() {
        var memory = ReadMemory();
        if (memory.AvailablePhysical < reserve || memory.AvailablePageFile < reserve) {
            throw new InvalidOperationException("Comparison stopped to preserve the Windows RAM and commit reserve.");
        }
    }

    public static void Retain() {
        GC.KeepAlive(job);
    }
}
'@

$heapMiB = if ($NodeHeapMiB -eq 0) { [int][Math]::Floor($BudgetMiB / 2) } else { $NodeHeapMiB }
if ($heapMiB -lt 64 -or $heapMiB -ge $BudgetMiB) {
    throw 'Node heap must be at least 64 MiB and smaller than the comparison job budget.'
}
[OwlApiComparisonJob]::Admit($BudgetMiB)
$requestOwner = if ($ParentProcessId -gt 0) {
    [Diagnostics.Process]::GetProcessById($ParentProcessId)
}
if ($requestOwner -and $requestOwner.HasExited) { throw 'Comparison caller has exited.' }
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $NodeExecutable
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.WorkingDirectory = (Get-Location).ProviderPath
$start.EnvironmentVariables['NODE_OPTIONS'] = "--max-old-space-size=$heapMiB"
$start.EnvironmentVariables['OWLAPI_COMPARISON_JOB_MIB'] = [string]$BudgetMiB
$start.EnvironmentVariables['OWLAPI_COMPARISON_NODE_HEAP_MIB'] = [string]$heapMiB
$gcFlag = if ($ExposeGc) { '--expose-gc ' } else { '' }
$start.Arguments = $gcFlag + '"' + $Worker + '" --protected-comparison "' + $RequestFile + '"'
$child = [Diagnostics.Process]::Start($start)
$wallTime = [Diagnostics.Stopwatch]::StartNew()
try {
    $stdout = $child.StandardOutput.BaseStream.CopyToAsync([Console]::OpenStandardOutput())
    $stderr = $child.StandardError.BaseStream.CopyToAsync([Console]::OpenStandardError())
    while (!$child.WaitForExit(1000)) {
        if ($requestOwner -and $requestOwner.HasExited) { throw 'Comparison caller has exited.' }
        if ($MaxSeconds -gt 0 -and $wallTime.Elapsed.TotalSeconds -ge $MaxSeconds) {
            throw 'Comparison reached its requested wall-time limit.'
        }
        [OwlApiComparisonJob]::CheckReserve()
    }
    [void]$stdout.GetAwaiter().GetResult()
    [void]$stderr.GetAwaiter().GetResult()
    exit $child.ExitCode
} finally {
    [OwlApiComparisonJob]::Retain()
    $child.Dispose()
    if ($requestOwner) { $requestOwner.Dispose() }
}
