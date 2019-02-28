import * as Express from 'express';
import * as bodyParser from 'body-parser';
import * as dialogflow from 'dialogflow';
import * as uuid from 'uuid';
import { sendSMS } from './services/messaging';
import * as twilio from 'twilio';
import * as moment from 'moment';
import 'reflect-metadata';
import { createConnection, getConnection } from 'typeorm';
import * as cors from 'cors';
import { Message } from './entity/Message';

require('dotenv').config();

const connection = createConnection({
  type: 'sqlite',
  entities: [Message],
  logging: false,
  database: '../messages.db',
  synchronize: true,
});

const PROJECT_NAME = 'solutionreach-appt';
console.log('starting...');
const port = process.env.PORT || 3000;

const app = Express();

app.use(bodyParser.json());
app.use(
  cors({
    origin: false,
  })
);
app.use(function(req, res: any, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin,X-Requested-With,Content-Type,Accept,content-type,application/json'
  );
  next();
});

// sendSMS(process.env.TRIAL_PHONE, 'the server is running')

app.get('/', async (_, res) => {
  try {
    res.status(200).send("I'm healthy");
  } catch (e) {
    res.status(500).send(e);
  }
});

app
  .use(bodyParser.urlencoded({ extended: false }))
  .post('/incoming_message', async (req, res) => {
    const messageText = req.body.Body;
    await connection;
    const fromPhone = req.body.From;
    const textToRespond = await processResponse(messageText);
    const incomingMessage = new Message();
    incomingMessage.text = messageText;
    incomingMessage.time = moment()
      .utc()
      .toDate();
    incomingMessage.outbound = false;
    incomingMessage.patronPhone = fromPhone;
    incomingMessage.save();

    const response = new Message();
    response.text = textToRespond;
    response.outbound = true;
    response.time = moment()
      .utc()
      .toDate();
    response.patronPhone = fromPhone;
    response.save();

    sendSMS(fromPhone, textToRespond);
    res.status(200).send();
  });

app.post('/recognize_intent', async (req, res) => {
  const textToRespond = await processResponse(req.body.Body);
  sendSMS(process.env.TRIAL_PHONE, textToRespond);
  res.status(200).send();
});

app.get('/messages', async (req, res) => {
  await connection;
  const messages = await Message.find();
  const indexedMessages = Object.keys(
    messages.reduce((prev, curr) => {
      prev[curr.patronPhone] = [];
      return prev;
    }, {})
  ).forEach((k) => {
    messages[k] = messages.filter((m) => m.patronPhone === k);
  });
  res.status(200).send(indexedMessages);
});

app.listen(port, () => {
  console.log(`Now listening on ${port}`);
});

const sesId = uuid.v4();

async function processResponse(responseText, projectId = PROJECT_NAME) {
  const sessionId = sesId;
  const sessionClient = new dialogflow.SessionsClient();
  const sessionPath = sessionClient.sessionPath(projectId, sessionId);
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: responseText,
        languageCode: 'en-US',
      },
    },
  };

  const intent = await sessionClient.detectIntent(request);
  if (intent && intent.length > 0) {
    const firstIntent = intent[0];

    const fulfillmentText = firstIntent.queryResult.fulfillmentText;
    const parsedText = fillSlots(
      fulfillmentText,
      firstIntent.queryResult.parameters.fields
    );
    return parsedText;
  }
  return 'something went wrong';
}

function fillSlots(text, parameters) {
  return Object.keys(parameters).reduce((prev, curr) => {
    return prev.replace(
      `#${curr}`,
      formatData(curr, parameters[curr][parameters[curr]['kind']])
    );
  }, text);
}
const dataParsingOperations: { [key: string]: (value: any) => string } = {
  date: (date) => {
    const resp = parseDate(date).format('dddd, MMMM DD, YYYY');
    console.log('date', date, resp);
    return resp;
  },
  time: (time) => {
    const resp = parseDate(time).format('h:mm a');
    console.log('time', time, resp)
    return resp
  },
};

function formatData(key, value) {
  return dataParsingOperations[key](value);
}

function parseDate(dateString) {
  return moment(dateString, "YYYY-MM-DDTkk:mm:ssZ")
}
