var express = require('express')
var http = require('http')
var fs = require('fs')
var config = require('./config')
var auth = require('./lib/auth')
var sessions = require("client-sessions")
var AWS = require('aws-sdk');

AWS.config.region = config['aws_region']
getEC2Rolename(AWS)
    .then((rolename)=>{
    return getEC2Credentials(AWS,rolename)
})
.then((credentials)=>{

    AWS.config.accessKeyId=credentials.AccessKeyId;
    AWS.config.secretAccessKey=credentials.SecretAccessKey;
    AWS.config.sessionToken = credentials.Token;

    console.log("Fetched temporary IAM credentials")

})
.catch((err)=>{
    console.log(err);
});

var s3 = new AWS.S3();
var users = {};

s3.getObject({Bucket: config['aws_bucket'], Key: 'users.json'}, function(err, data) {
    if (err) {
        console.log("Failed to fetch users.json from bucket! " + err)
    }

    try {
        users = JSON.parse(data.Body.toString('utf-8'))
    } catch (err) {
        console.log("Failed to load users.json")
        users = {}
    }
    return ; // Use the encoding necessary
})




config['authorized_users'] = users

var app = express()

console.log('Logcabin starting...')

app.use(sessions({cookieName: 'session', secret: config.cookie_secret}))

auth.setup(express, app, config)

proxyES()
proxyKibana4()

http.createServer(app).listen(config.listen_port)
console.log('Logcabin listening on ' + config.listen_port)

function proxyES() {
    app.use("/__es", function (request, response, next) {

        var proxyRequest = http.request({
            host: config.es_host,
            port: config.es_port,
            path: request.url,
            method: request.method,
            headers: request.headers
        }, function (proxyResponse) {
            response.writeHead(proxyResponse.statusCode, proxyResponse.headers)
            proxyResponse.pipe(response)
        })
        request.pipe(proxyRequest)
    })
}

function proxyKibana4() {
    app.use("/", function (request, response, next) {

        var proxyRequest = http.request({
            host: config.kibana_host,
            port: config.kibana_port,
            path: request.url,
            method: request.method,
            headers: request.headers
        }, function (proxyResponse) {
            response.writeHead(proxyResponse.statusCode, proxyResponse.headers)
            proxyResponse.pipe(response)
        })
        request.pipe(proxyRequest)
    })
}

function getEC2Rolename(AWS){
    var promise = new Promise((resolve,reject)=>{

        var metadata = new AWS.MetadataService();

    metadata.request('/latest/meta-data/iam/security-credentials/',function(err,rolename){
        if(err) reject(err);
        console.log(rolename);
        resolve(rolename);
    });
});

    return promise;
};

function getEC2Credentials(AWS,rolename){
    var promise = new Promise((resolve,reject)=>{

        var metadata = new AWS.MetadataService();

    metadata.request('/latest/meta-data/iam/security-credentials/'+rolename,function(err,data){
        if(err) reject(err);

        resolve(JSON.parse(data));
    });
});

    return promise;
};