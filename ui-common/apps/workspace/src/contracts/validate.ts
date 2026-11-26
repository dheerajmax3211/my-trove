/**
 * A deliberately small JSON Schema (draft 2020-12) validator for the contract tests in `/contracts`.
 *
 * `ui-common` declares no schema validator (ajv and zod sit in node_modules only as transitive dependencies, and the
 * contract suite may not add one), so this supports exactly the keywords the contract files use and REFUSES any
 * other keyword, so a schema can never silently pass because a keyword was ignored:
 * `type` (string or array; "integer" is a whole number), `required`, `properties`, `additionalProperties` (boolean
 * or schema), `items`, `enum`, `const`, `format` (date-time, date), `$ref` (`#/$defs/name`, `other.schema.json` or
 * `other.schema.json#/$defs/name`, all in the same folder), `$defs`, and the annotations `$schema`, `title`,
 * `description`.
 */

export type Schema = { readonly [keyword: string]: unknown }

/** Contract files by file name within one folder, e.g. `item.schema.json`. */
export type SchemaFolder = ReadonlyMap<string, Schema>

const ANNOTATIONS = new Set(['$schema', 'title', 'description', '$defs', '$comment'])
const KEYWORDS = new Set([
  'type',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'format',
  '$ref',
])

// RFC 3339 date-time (what `format: date-time` means in JSON Schema) and full-date.
const DATE_TIME =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt]([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?([Zz]|[+-]([01]\d|2[0-3]):[0-5]\d)$/
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'object':
      return typeOf(value) === 'object'
    default:
      return typeOf(value) === type
  }
}

function isSchema(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Returns every violation as `<json path>: <message>`; empty means valid. */
export function validate(folder: SchemaFolder, file: string, value: unknown): string[] {
  const root = folder.get(file)
  if (!root) throw new Error(`No contract ${file}`)
  const errors: string[] = []
  check(folder, root, root, value, '$', errors)
  return errors
}

function resolve(folder: SchemaFolder, root: Schema, ref: string): { root: Schema; schema: Schema } {
  const [file, pointer] = ref.split('#')
  const doc = file ? folder.get(file) : root
  if (!doc) throw new Error(`Unresolvable $ref ${ref}`)
  if (!pointer) return { root: doc, schema: doc }
  const match = /^\/\$defs\/([^/]+)$/.exec(pointer)
  const defs = doc.$defs
  const target = match && isSchema(defs) ? defs[match[1] ?? ''] : undefined
  if (!isSchema(target)) throw new Error(`Unresolvable $ref ${ref}`)
  return { root: doc, schema: target }
}

function check(
  folder: SchemaFolder,
  root: Schema,
  schema: Schema,
  value: unknown,
  path: string,
  errors: string[],
): void {
  for (const keyword of Object.keys(schema)) {
    if (!KEYWORDS.has(keyword) && !ANNOTATIONS.has(keyword))
      throw new Error(`Unsupported schema keyword "${keyword}" at ${path}`)
  }

  if (typeof schema.$ref === 'string') {
    const target = resolve(folder, root, schema.$ref)
    check(folder, target.root, target.schema, value, path, errors)
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string]
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected ${types.join(' or ')}, got ${typeOf(value)}`)
      return
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((option) => sameJson(option, value)))
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`)

  if ('const' in schema && !sameJson(schema.const, value))
    errors.push(`${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`)

  if (typeof schema.format === 'string' && typeof value === 'string') {
    if (schema.format === 'date-time' && !DATE_TIME.test(value))
      errors.push(`${path}: "${value}" is not an RFC 3339 date-time`)
    else if (schema.format === 'date' && !DATE.test(value))
      errors.push(`${path}: "${value}" is not a YYYY-MM-DD date`)
    else if (schema.format !== 'date-time' && schema.format !== 'date')
      throw new Error(`Unsupported format "${schema.format}" at ${path}`)
  }

  if (isSchema(value) && typeOf(value) === 'object') {
    const properties = isSchema(schema.properties) ? schema.properties : {}
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[])
        if (!(key in value)) errors.push(`${path}: missing required property "${key}"`)
    }
    for (const [key, child] of Object.entries(value)) {
      const propertySchema = properties[key]
      if (isSchema(propertySchema)) check(folder, root, propertySchema, child, `${path}.${key}`, errors)
      else if (schema.additionalProperties === false)
        errors.push(`${path}: unexpected property "${key}"`)
      else if (isSchema(schema.additionalProperties))
        check(folder, root, schema.additionalProperties, child, `${path}.${key}`, errors)
    }
  }

  if (Array.isArray(value) && isSchema(schema.items)) {
    const items = schema.items
    value.forEach((element, index) => check(folder, root, items, element, `${path}[${index}]`, errors))
  }
}
