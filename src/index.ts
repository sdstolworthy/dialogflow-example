import * as Express from 'express';
import * as bodyParser from 'body-parser';
import * as dialogflow from 'dialogflow';
import * as uuid from 'uuid';
import { sendSMS } from './services/messaging';
import 'reflect-metadata';
import { createConnection } from 'typeorm';

// createConnection()
//   .then(async (connection) => {})
//   .catch((error) => console.log(error));
require('dotenv').config();

const PROJECT_NAME = 'solutionreach-appt';
console.log('starting...');
const port = process.env.PORT || 3000;

const app = Express();

app.use(bodyParser.json());

// sendSMS(process.env.TRIAL_PHONE, 'the server is running')

app.get('/', async (_, res) => {
  try {
    const sample = await runFirstQuestion();
    res.status(200).send(sample);
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

app
  .use(bodyParser.urlencoded({ extended: false }))
  .post('/incoming_message', async (req, res) => {
    const messageText = req.body.Body
    const textToRespond = await processResponse(messageText);
    console.log(messageText)
    sendSMS(process.env.TRIAL_PHONE, textToRespond)
    res.status(200).send();
  });

app.post('/recognize_intent', async (req, res) => {
  const textToRespond = await processResponse(req.body.Body)
  sendSMS(process.env.TRIAL_PHONE, textToRespond)
  res.status(200).send()
})

app.listen(port, () => {
  console.log(`Now listening on ${port}`);
});

const sesId = uuid.v4();

async function runFirstQuestion(projectId = PROJECT_NAME) {

  const intentsClient = new dialogflow.IntentsClient();
  const request = {
    parent: intentsClient.projectAgentPath(projectId),
  };

  console.log('intents', await intentsClient.listIntents(request));
}

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
    const firstIntent = intent[0]
    return firstIntent.queryResult.fulfillmentText
  }
  return "something went wrong"
}
