import * as Express from "express"
import * as bodyParser from "body-parser"
import * as dialogflow from "dialogflow"
import * as uuid from "uuid"
import PhoneNumber from "awesome-phonenumber"
import { sendSMS } from "./services/messaging"
import * as moment from "moment"
import "reflect-metadata"
import { createConnection, getConnection } from "typeorm"
import * as cors from "cors"
import { Message } from "./entity/Message"

require("dotenv").config()
const SAMPLE_MEDIA =
  "https://lh3.googleusercontent.com/WbUXW7uW-jaMMvDTvgGYWjhVYJYNBjCOEhxRCj1GsfZaq1R7rmOpxKMuYHAa3q99t0kjSE7_5VFK78HzrAPnSw1tlgOzkmGdcez5iPElNVwN-hD1sE88-eak1uMqh6EwG7DkcztzNpb1E_urNQV_ZAmczs4tBCCurn4X0lLmKOlC-LEcXUN9BDaYDvvDsQYC2UkISP_sIKvwosKidw9xFdUDn10t3HEl6enAdlF0LMZQSNApz8gpquDLPawHAoXsVA_o7-cBGg94KuOeB3afTfGad9nOilk7KzJDXQSnb7iCsBk5HKxEjNAUEGnbOicL3cbwm1qyhk4_RsdqBzdAcJ7pHALijnNPWBYG2YkCHdUsYr5crFb96em5g_6zeYZiR8VKpkvBPrPJ9Opsr6glu4WkDWIK9nwjzei2oTDvLFhyzNQL8bVInP0naiD7ThNTzGlX9DV_Mc8KddFSKoUOAo2K5jasbt4CfCjBzHVmx0Za54Oq0rXZ4QmzTLdvljCiAbhunO5ASniJXvPt60ilob3OYif1FcIHiO8DzusGSkeN_eUG_vJqF_X_8I6JL-h3JIggtVab_fDSlpCpnQAkL8SFrIxyJFKfDqLRbEQ=w3360-h1832"
const connection = createConnection({
  type: "sqlite",
  entities: [Message],
  logging: false,
  database: "./messages.db",
  synchronize: true
})

const PROJECT_NAME = "solutionreach-appt-dev"
console.log("starting...")
const port = process.env.PORT || 3000

const app = Express()

app.use(bodyParser.json())
app.use(
  cors({
    origin: false
  })
)
const noCors = function(req, res: any, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Credentials", true)
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS")
  res.header(
    "Access-Control-Allow-Headers",
    "Origin,X-Requested-With,Content-Type,Accept,content-type,application/json"
  )
  next()
}
app.use(noCors)

// sendSMS(process.env.TRIAL_PHONE, 'the server is running')

app.get("/", async (_, res) => {
  try {
    res.status(200).send("I'm healthy")
  } catch (e) {
    res.status(500).send(e)
  }
})

// app
//   .use(bodyParser.urlencoded({ extended: false }))
//   .use(noCors)
//   .post("/sendMessage", async (req, res) => {
//     await connection
//     const { messageText, recipient } = req.body
//     const message = new Message()
//     message.patronPhone = recipient
//     message.text = messageText
//     message.outbound = true
//     message.time = new Date()
//     message.save()
//     sendSMS(recipient, message)
//   })

app
  .use(bodyParser.urlencoded({ extended: false }))
  .use(noCors)
  .post("/incoming_message", async (req, res) => {
    const messageText = req.body.Body
    await connection
    const fromPhone = req.body.From
    const incomingMessage = new Message()

    incomingMessage.text = messageText
    incomingMessage.time = moment()
      .utc()
      .toDate()
    incomingMessage.outbound = false
    incomingMessage.patronPhone = fromPhone
    incomingMessage.save()
    const response = await expandResponse(messageText, fromPhone)

    response.save()

    sendSMS(fromPhone, response)
    res.status(200).send()
  })

app.get("/messages", async (req, res) => {
  await connection
  const messages = await Message.find()
  const indexedMessages = {}
  Object.keys(
    messages.reduce((prev, curr) => {
      const pn = new PhoneNumber(curr.patronPhone).getNumber("national")
      console.log(pn)
      prev[pn] = []
      return prev
    }, {})
  ).forEach(k => {
    indexedMessages[k] = messages.filter(m => m.patronPhone === k)
  })
  res.status(200).send(indexedMessages)
})

app.listen(port, () => {
  console.log(`Now listening on ${port}`)
})

const sesId = uuid.v4()

async function expandResponse(
  responseText,
  fromPhone,
  projectId = PROJECT_NAME
): Promise<Message> {
  const sessionId = sesId
  const sessionClient = new dialogflow.SessionsClient()
  const sessionPath = sessionClient.sessionPath(projectId, sessionId)
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: responseText,
        languageCode: "en-US"
      }
    }
  }

  const intent = await sessionClient.detectIntent(request)
  console.log(JSON.stringify(intent, null, 2))
  if (intent && intent.length > 0) {
    const firstIntent = intent[0]

    const fulfillmentText = firstIntent.queryResult.fulfillmentText
    const parsedText = fillSlots(
      fulfillmentText,
      firstIntent.queryResult.parameters.fields
    )
    let response = new Message()
    response.text = parsedText
    response.outbound = true
    response.time = moment()
      .utc()
      .toDate()
    response.patronPhone = fromPhone
    if ("intent" in firstIntent.queryResult) {
      response = intentSpecificExpansion(
        response,
        firstIntent.queryResult.intent.name
      ) // TODO: make dynamic
    }
    return response
  }
  throw new Error("something went wrong while expanding the response")
}

function intentSpecificExpansion(message: Message, intent: string): Message {
  if (intent in intentLibrary) {
    return intentLibrary[intent](message)
  }
  return message
}

const intentLibrary: { [key: string]: (message: Message) => Message } = {
  "projects/solutionreach-appt-dev/agent/intents/29485fe8-4fb3-4d51-9e63-46ed99ca41f0": message => {
    message.mediaUrl = SAMPLE_MEDIA
    return message
  }
}

function fillSlots(text, parameters) {
  return Object.keys(parameters).reduce((prev, curr) => {
    return prev.replace(
      `#${curr}`,
      formatData(curr, parameters[curr][parameters[curr]["kind"]])
    )
  }, text)
}
const dataParsingOperations: { [key: string]: (value: any) => string } = {
  date: date => parseDate(date).format("dddd, MMMM D, YYYY"),
  time: time => parseDate(time).format("h:mm a")
}

function formatData(key, value) {
  try {
    return dataParsingOperations[key](value)
  } catch (e) {
    return value
  }
}

function parseDate(dateString, format = "YYYY-MM-DDTkk:mm:ssZ") {
  return moment.parseZone(dateString, format).local(true)
}
