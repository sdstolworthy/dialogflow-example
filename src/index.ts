import * as Express from "express";
import * as bodyParser from "body-parser";
import * as dialogflow from "dialogflow";
import * as uuid from "uuid";
import { sendSMS } from "./services/messaging";

require('dotenv').config()

const PROJECT_NAME = "solutionreach-appt";
console.log("starting...");
const port = process.env.PORT || 3000;

const app = Express();

app.use(bodyParser.json());

app.get("/", async (_, res) => {
  try {
    const sample = await runFirstQuestion();
    // await sendSMS("+16154918300", "test message")
    //   .then((data: any) => console.log('success', data))
    //   .catch((error: any) => console.log('error', error));
    res.status(200).send(sample);
  } catch (e) {
    console.log(e)
    res.status(500).send(e);
  }
});

app.get("/followUp", async (_, res) => {
  try {
    const data = await processResponse();
    res.status(200).send(data);
  } catch (e) {
    res.status(502).send(e);
  }
});

app.use(bodyParser.urlencoded({ extended: false })).post("/incoming_message", async (req, res) => {
  processResponse(req.body.Body)
  res.status(200).send()
})

app.listen(port, () => {
  console.log(`Now listening on ${port}`);
});

const sesId = uuid.v4();

async function runFirstQuestion(projectId = PROJECT_NAME) {
  const sessionId = sesId
  const sessionClient = new dialogflow.SessionsClient();
  const sessionPath = sessionClient.sessionPath(projectId, sessionId);

  const request = {
    session: sessionPath,
    queryInput: {
      event: {
        name: "appt_reminder",
        languageCode: "en-us"
      }
    }
  };

  const response = await sessionClient.detectIntent(request);
  return response;
}

async function processResponse(projectId = PROJECT_NAME) {
  const sessionId = sesId;
  const sessionClient = new dialogflow.SessionsClient();
  const sessionPath = sessionClient.sessionPath(projectId, sessionId);
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: "sure",
        languageCode: "en-US"
      }
    }
  };
  return sessionClient.detectIntent(request);
}
