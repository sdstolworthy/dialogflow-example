import * as Express from 'express';
import * as bodyParser from 'body-parser';
import * as dialogflow from 'dialogflow';
import * as uuid from 'uuid';
import { sendSMS } from './services/messaging';
import * as twilio from 'twilio';
import 'reflect-metadata';
import { createConnection } from 'typeorm';
import * as cors from 'cors';

require('dotenv').config();

const PROJECT_NAME = 'solutionreach-appt';
console.log('starting...');
const port = process.env.PORT || 3000;

interface Message {
  text: string;
  outbound: boolean;
}
const messages: Message[] = [];

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
    res.status(200).send('I\'m healthy');
  } catch (e) {
    res.status(500).send(e);
  }
});

app.post('/recognize_intent', async (req, res) => {
  console.log(req.body)
  const textToRespond = await processResponse(req.body.Body);
  sendSMS(process.env.TRIAL_PHONE, textToRespond);
  res.status(200).send();
});

app.get('/messages', async (req, res) => {
  res.status(200).send(messages);
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
    messages.push({
      text: responseText,
      outbound: false,
    });
    messages.push({
      text: firstIntent.queryResult.fulfillmentText,
      outbound: true,
    });
    return firstIntent.queryResult.fulfillmentText;
  }
  return 'something went wrong';
}
