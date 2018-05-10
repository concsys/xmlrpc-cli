#!/usr/bin/env node

const util = require("util")
const yaml = require("js-yaml")
const xmlrpc = require("xmlrpc")
const path = require("path")
//const dateFormat = require('dateformat')
const moment = require("moment")
const { Console } = require('console');
const { ArgumentParser } = require("argparse")
const xmlrpcSerializer = require(path.join(path.dirname(require.resolve("xmlrpc")),"serializer"))
const url = require('url')
console = new Console(process.stderr, process.stderr)

class CustomDateFormatter {
	constructor(formats) {
		formats = formats || {}
		this.encodeFormat = formats.encode || "YYYYMMDDTHH:mm:ss"
		this.decodeFormats = formats.decode || [ "YYYYMMDDTHH:mm:ss", "YYYYMMDDTHH:mm:ssZ" ]
	}
	encodeIso8601(date) {
		return moment(date).format(this.encodeFormat)
	}
	decodeIso8601(string) {
		return moment(string, this.decodeFormats).toDate()
	}
}

class FormattedDate extends xmlrpc.CustomType {
	constructor(raw) {
		super(raw)
		this.tagName = 'dateTime.iso8601'
		this.raw = raw
	}
	serialize(xml) {
		return xml.ele(this.tagName).txt( moment(this.raw.date).format(this.raw.format) );
	}
}

function changeDates(object, format) {
	if ( typeof object == "object" ) {
		Object.entries(object).forEach(([key, value]) => {
			if ( value instanceof Date ) {
				object[key] = new FormattedDate({date:value, format:format})
			}
			else if ( typeof value == "object" ) {
				changeDates(object[key], format)
			}
		})
	}
}

function main() {
	let argumentParser = new ArgumentParser({addHelp: true});
	argumentParser.addArgument([ "--df" ], {dest: "dateFormat", type: "string", metavar: "MOMENT_FORMAT_STRING", help: "format to use for encoding and decoding"})
	argumentParser.addArgument([ "--df-encode" ], {dest: "dateFormatEncode", type: "string", metavar: "MOMENT_FORMAT_STRING", help: "format to use for encoding (only once)"})
	argumentParser.addArgument([ "--df-decode" ], {dest: "dateFormatDecode", type: "string", metavar: "MOMENT_FORMAT_STRING", help: "add additional format to use for decoding (repeat to add more)"})
	argumentParser.addArgument([ "-H", "--header" ], {dest: "headers", action:"append", type: "string", metavar: "Header: value", help: "url to send to"})
	argumentParser.addArgument("url", {type: "string", help: "url to send to"})
	argumentParser.addArgument("methodName", {type: "string", help: "method to call"})
	argumentParser.addArgument("params", {type: "string", help: "params to send (yaml)"})

	try {
		var arguments = argumentParser.parseArgs()
	}
	catch ( exception ) {
		console.error(`caught: ${exception}`)
		argumentParser.printUsage()
		argumentParser.printHelp()
		throw exception
	}

	console.error(`arguments = ${util.inspect(arguments)}`)
	const parsedUrl = url.parse(arguments.url)
	console.error(`parsedUrl = ${util.inspect(parsedUrl)}`)
	const params = yaml.load(arguments.params)
	console.error(`params = ${util.inspect(params)}`)
	changeDates( params, arguments.dateFormatEncode || arguments.dateFormat || "YYYYMMDDTHH:mm:ss" )
	console.error(`params = ${util.inspect(params)}`)
	
	/*
	var dateTimeOptions = {
		colons: true,
		hyphens: false,
		local: true,
		ms: false,
		offset: false,
	}
	if ( arguments.dateTimeOptions ) {
		const extraDateTimeOptions = yaml.load(arguments.dateTimeOptions)
		console.error(`extraDateTimeOptions = ${util.inspect.extraDateTimeOptions}`)
		dateTimeOptions = { ...dateTimeOptions, ...extraDateTimeOptions }
	}
	console.error(`dateTimeOptions = ${util.inspect(dateTimeOptions)}`)
	xmlrpc.dateFormatter.setOpts(dateTimeOptions)
	let dateFormats = { encode: "YYYYMMDDTHH:mm:ss", decode: [ "YYYYMMDDTHH:mm:ss", "YYYYMMDDTHH:mm:ssZ" ] }
	if ( arguments.dateFormat ) {
		dateFormats = { encode: arguments.dateFormat, decode: [ arguments.dateFormat ] }
	}
	if ( arguments.dateFormatDecode ) {
		dateFormats.decode = dateFormat.decode.concat( arguments.dateFormatDecode )
	}
	if ( arguments.dateFormatEncode ) {
		dateFormats.encode = arguments.dateFormatEncode
	}
	const customDateFormatter = new CustomDateFormatter(dateFormats)
	//xmlrpc.dateFormatter = customDateFormatter
	*/
	var client = null
	var clientOptions = {
		host: parsedUrl.hostname,
		port: parsedUrl.port,
		path: parsedUrl.path,
		headers: {},
	}
	for ( const header of arguments.headers ) {
		let [key, value] = header.split(":")
		clientOptions.headers[key] = value
	}
	console.error(`clientOptions = ${clientOptions}`)
	if ( parsedUrl.protocol == "http:" ) {
		client = xmlrpc.createClient(clientOptions)
	}
	else if ( parsedUrl.protocol == "https:" ) {
		client = xmlrpc.createSecureClient(clientOptions)
	}
	else {
		console.error(`Invalid protocol for url ${parsedUrl.protocol}`)
		argumentParser.printUsage()
		argumentParser.printHelp()
		process.exitCode = 1
		return
	}
	var xml = xmlrpcSerializer.serializeMethodCall(arguments.methodName, params, client.options.encoding)
	console.error(`xml = ${xml}`)
	client.methodCall(arguments.methodName, params, (error, value) => {
		if ( error ) {
			const request = error.req || {}
			//console.error(`request = ${util.inspect(request)}`)
			console.error(`request.getHeaders() = ${util.inspect(request.getHeaders())}`)
			const response = error.res || {}
			console.error(`response.statusCode = ${util.inspect(response.statusCode)}`)
			console.error(`response.headers = ${util.inspect(response.headers)}`)
			console.error(`error.body = ${util.inspect(error.body)}`)
			console.error(`error = ${util.inspect(error)}`)
		}
		console.error(`value = ${util.inspect(value)}`)
		process.stdout.write(JSON.stringify(value || [], null, 4))
		process.stdout.write("\n")
	})
}

main()
