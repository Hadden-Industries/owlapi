# @ryotsu/picomatch

A fork of [picomatch](https://www.npmjs.com/package/picomatch) 4.0.7 with a fix for [CVE-2026-112366](https://nvd.nist.gov/vuln/detail/CVE-2026-112366) affecting single-branch repeated wildcard extglobs.

## Install

```sh
npm install @ryotsu/picomatch
```

## Usage

```js
const picomatch = require('@ryotsu/picomatch');
const isMatch = picomatch('*.js');

isMatch('example.js'); // true
```

For the API and options, see the [upstream documentation](https://github.com/micromatch/picomatch#readme).

## Compatibility

The patch can change captured substrings and treats unsupported complex single-branch wildcard extglobs literally. Keep the safeguard enabled when handling untrusted patterns; `maxExtglobRecursion: false` disables it.

See the [changelog](https://github.com/ryotsu-kankichi/secured-picomatch/blob/master/CHANGELOG.md) for patch details.

## License

MIT. Original picomatch by [Jon Schlinkert](https://github.com/jonschlinkert). Original authorship and copyright notices are preserved in [LICENSE](LICENSE).
