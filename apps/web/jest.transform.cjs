const path = require('path')
const { default: tsJest } = require('ts-jest')

const tsJestTransformer = tsJest.createTransformer({
  tsconfig: path.join(__dirname, 'tsconfig.json'),
  diagnostics: { ignoreCodes: [151001] },
})

module.exports = {
  process(src, filename, config, transformOptions) {
    const sanitized = src.replace(/import\.meta\.env\.[A-Z0-9_]+/g, 'undefined')
    return tsJestTransformer.process(sanitized, filename, config, transformOptions)
  },
}
