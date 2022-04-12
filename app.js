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

const allEventTypes = ["supportMessage", "botMessage", "userMessage", "broadcast", "peerToPeer", "endPoint"];

/**
 * environment needs to be handled for databases.
 * Also environment based credentials needs to be.
 */

//  redis section
const redisClient = redis.createClient({
  url: (environment == "development") ? '' : ('redis://:' + redisPassword + '@' + (redisHost + ':' + redisPort))
});

var messageQueue = null;
var socketConnection = null;
const incomingMessageQueue = 'incomingMessages';
const savedMessageQueue = 'savedMessages';

redisClient.connect();
amqp.connect('amqp://localhost', function (error0, connection) {
  if (error0) {
    throw error0;
  }
  console.log(error0 ? "connection error for rabbitmq" : "connection established for rabbitmq");

  connection.createChannel(function (error1, incomingMessageChannel) {
    if (error1) {
      throw error1;
    }

    incomingMessageChannel.assertQueue(incomingMessageQueue, { durable: false });

    messageQueue = incomingMessageChannel;
    // channel.sendToQueue(queue, Buffer.from(msg));
    // console.log(" [x] Sent %s", msg);
  });

  connection.createChannel(function (error1, savedMessageChannel) {
    if (error1) {
      throw error1;
    }
    savedMessageChannel.assertQueue(savedMessageQueue, { durable: false });
    savedMessageChannel.consume(savedMessageQueue, sendMessageFromQueue, { noAck: true });
  })
});

redisClient.on('connect', () => {
  console.log('Connected to redis');
});
redisClient.on('error', (err) => console.log('Redis client Error', err));

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

// const authenticate = (socket, next) => {
//   const { token, userId, userType } = socket.handshake.query;
//   (token && userId && (userType == "userMessage")) ? jwt.verify(token, AUTH_SECRET, function (err, decoded) {
//     Boolean(err) ? next(new Error("not authorized")) : next();
//   }) : next(new Error("not authorized"));
// }

const authenticate = (socket, next) => {
  const { token, userId, userType } = socket.handshake.query;
  jwt.verify(token, AUTH_SECRET, function (err, decoded) {
    Boolean(err) ? next(new Error("not authorized")) : next();
  });
}

io.use(authenticate);

io.on("connection", (socket) => {
  switch (socket.handshake.query.userType) {
    case "userMessage":
      redisClient.set(socket.handshake.query.userId, socket.id);
      break;
    case "supportMessage":
      redisClient.set(socket.handshake.query.channelId + "Support", socket.id)
      break;
      case "botMessage":
      // console.log(socket.id);
      redisClient.set((socket.handshake.query.channelId + "Bot"), socket.id)
      break;
    default:
      break;
  }
  // console.log("someone connected");
  socketConnection = socket;
  const regularEventTypes = ["supportMessage", "botMessage", "userMessage"];
  regularEventTypes.forEach(event => {
    socket.on(event, (message) => {
      sendMessageToQueue(event, message);
    })
  })
  // socket.on("supportMessage", (message) => {
  //   sendMessageToQueue("supportMessage", message);
  // })
  // socket.on("botMessage", (message) => {
  //   sendMessageToQueue("botMessage", message);
  // })
  // socket.on("userMessage", (message) => {
  //   sendMessageToQueue("userMessage", message);
  // })
});

const sendMessageToQueue = (event, message) => {
  const messageToQueue = JSON.stringify(Object.assign({ messageType: event }, message))
  messageQueue.sendToQueue(incomingMessageQueue, Buffer.from(messageToQueue));
}

const sendMessageFromQueue = (message) => {
  const savedData = JSON.parse(message.content.toString());
  switch (savedData.messageType) {
    case "userMessage":
      sendMessageToClient(savedData.channelId + "Support", savedData);
      sendMessageToClient(savedData.channelId + "Bot", savedData);
      break;
    case "botMessage":
      sendMessageToClient(savedData.userId, savedData);
      break;
    case "supportMessage":
      sendMessageToClient(savedData.userId, savedData);
      break;
    default:
      break;
  }
}

const sendMessageToClient = async (target, data) => {
  const clientTopic = await redisClient.get(target);
  io.to(clientTopic).emit('message', JSON.stringify(data))
}