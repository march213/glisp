import {lispError} from './repl'
import {createKeyword} from './types'

export const SELECTION_START = '\u029b'
export const SELECTION_END = '\u029c'

class Reader {
	public tokens: (string | symbol)[]
	public position: number

	constructor(tokens: (string | symbol)[]) {
		this.tokens = [...tokens]
		this.position = 0
	}

	public next() {
		return this.tokens[this.position++]
	}

	public peek() {
		return this.tokens[this.position]
	}
}

export const SYM_CURSOR_START = Symbol('CURSOR_START')

function tokenize(str: string, outputPosition = false) {
	// eslint-disable-next-line no-useless-escape
	const re = /[\s,]*(~@|[\[\]{}()'`~^@]|"(?:\\.|[^\\"])*"|;.*|[^\s\[\]{}('"`,;)]*)/g
	let match = null
	const spaceRe = /^[\s,]*/
	let spaceMatch = null,
		spaceOffset = null
	const results = []

	while ((match = re.exec(str)) && match[1] != '') {
		if (match[1][0] === ';') {
			continue
		}

		if (outputPosition) {
			spaceMatch = spaceRe.exec(match[0])
			spaceOffset = spaceMatch ? spaceMatch[0].length : 0

			results.push([match[1], match.index + spaceOffset] as [string, number])
		} else {
			results.push(match[1])
		}
	}
	return results
}

function readAtom(reader: Reader) {
	const token = reader.next()

	if (typeof token === 'string') {
		if (token.match(/^[-+]?[0-9]+$/)) {
			// integer
			return parseInt(token, 10)
		} else if (token.match(/^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/)) {
			// float
			return parseFloat(token)
		} else if (token.match(/^"(?:\\.|[^\\"])*"$/)) {
			// string
			return token
				.slice(1, token.length - 1)
				.replace(/\\(.)/g, (_: any, c: string) => (c === 'n' ? '\n' : c)) // handle new line
		} else if (token[0] === '"') {
			throw lispError("[READ] expected '\"', got EOF")
		} else if (token[0] === ':') {
			return createKeyword(token.slice(1))
		} else if (token === 'nil') {
			return null
		} else if (token === 'true') {
			return true
		} else if (token === 'false') {
			return false
		} else {
			// symbol
			return Symbol.for(token as string)
		}
	} else {
		return token
	}
}

// read list of tokens
function readList(reader: Reader, start = '(', end = ')') {
	const ast = []

	let token = reader.next()

	if (token !== start) {
		throw lispError(`[READ] expected '${start}'`)
	}

	while ((token = reader.peek()) !== end) {
		if (!token) {
			throw lispError(`[READ] expected '${end}', got EOF`)
		}

		ast.push(readForm(reader)) // eslint-disable-line @typescript-eslint/no-use-before-define
	}

	reader.next()
	return ast
}

function readForm(reader: Reader): any {
	const token = reader.peek()

	switch (token) {
		// reader macros/transforms
		case ';':
			return null
		case "'":
			reader.next()
			return [Symbol.for('quote'), readForm(reader)]
		case '`':
			reader.next()
			return [Symbol.for('quasiquote'), readForm(reader)]
		case '~':
			reader.next()
			return [Symbol.for('unquote'), readForm(reader)]
		case '~@':
			reader.next()
			return [Symbol.for('splice-unquote'), readForm(reader)]
		case '#':
			reader.next()
			return [Symbol.for('fn'), [], readForm(reader)]
		case '^': {
			reader.next()
			const meta = readForm(reader)
			return [Symbol.for('with-meta'), readForm(reader), meta]
		}
		case '@':
			reader.next()
			return [Symbol.for('deref'), readForm(reader)]
		// list
		case ')':
			throw lispError("unexpected ')'")
		case '(':
			return readList(reader)

		// atom
		default:
			return readAtom(reader)
	}
}

export class BlankException extends Error {}

export default function readStr(str: string) {
	const tokens = tokenize(str) as string[]
	if (tokens.length === 0) {
		throw new BlankException()
	}
	const ast = readForm(new Reader(tokens))
	return ast
}
