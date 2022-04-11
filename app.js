const socketServer = require("socket.io").Server;
const redis = require("redis");
var jwt = require('jsonwebtoken');
var amqp = require('amqplib/callback_api');

const environment = "development"

const AUTH_SECRET = "shambhoShambhaviPriyah"
const redisPassword = 'Kqid8w9R1e72wEeb8RXBmAWL5uIO6dG3';
const redisHost = 'redis-16254.c264.ap-south-1-1.ec2.cloud.redislabs.com';
const redisPort = 16254;
const socketPORT = 8080;

const allEventTypes = [ "supportMessage", "botMessage", "userMessage", "broadcast", "peerToPeer", "endPoint"];

/**
 * environment needs to be handled for databases.
 * Also environment based credentials needs to be.
 */

//  redis section
const client = redis.createClient({
  url: (environment == "development") ? '' :  ('redis://:' + redisPassword + '@' + (redisHost + ':' + redisPort))
});

var messageQueue = null;
const queueTopic = 'incomingMessages';

client.connect();
amqp.connect('amqp://localhost', function(error0, connection) {
  if (error0) {
    throw error0;
  }
  console.log(error0 ? "connection error for rabbitmq" : "connection established for rabbitmq");

  connection.createChannel(function(error1, channel) {
    if (error1) {
      throw error1;
    }
    var queue = 'hello';
    var msg = 'Hello world';

    channel.assertQueue(queueTopic, {
      durable: false
    });

    messageQueue = channel;
    // channel.sendToQueue(queue, Buffer.from(msg));
    // console.log(" [x] Sent %s", msg);
  });
});

client.on('connect', () => {
  console.log('Connected to redis');
});
client.on('error', (err) => console.log('Redis Client Error', err));

/**
 * 
 * The plan :
 *  First the widget makes a get request with private key and channelid with userid
 *  An encrypted token will be sent to front end and will be stored at the localstorage
 *  every event in the front end will be passed along with this userToken.
 *  removal of this user token is marked as logout and un authenticated.
 * 
 *  this request happens only at the very first time of site load.
 *  each load of the site after next will be using the same existing token.
 */

const io = new socketServer(socketPORT, {});

/**
 * @name Handshake-authentication-logic
 * @description authentication needs to handle for supportMessage, botMessage, endPoint
 * supportMessage and botMessage needs to authenticated also with loginToken and botSecret respectively
 */

const authenticate = (socket, next) => {
  const { token, userId, userType } = socket.handshake.query;
  ( token && userId && (userType == "userMessage") ) ? jwt.verify(token, AUTH_SECRET, function (err, decoded) {
    Boolean(err) ? next(new Error("not authorized")) : next();
  }) : next(new Error("not authorized"));
}

io.use(authenticate);

io.on("connection", (socket) => {
  client.set(socket.handshake.query.userId, socket.id)
  console.log("someone connected");

  const regularEventTypes = [ "supportMessage", "botMessage", "userMessage" ];
  regularEventTypes.forEach(event =>{
    socket.on(event, (message) => {
      sendMessageToQueue(event, message);
    })
  })
});

const sendMessageToQueue = (event, message) => {
  const messageToQueue = JSON.stringify(Object.assign({ messageType : event }, message))
  messageQueue.sendToQueue(queueTopic, Buffer.from(messageToQueue));
  console.log("Message sent to " + queueTopic + " Queue");
}
