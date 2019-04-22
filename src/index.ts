import * as Express from "express"
import * as bodyParser from "body-parser"
import * as dialogflow from "dialogflow"
import * as uuid from "uuid"
import { sendSMS } from "./services/messaging"
import * as moment from "moment"
import "reflect-metadata"
import { createConnection, getConnection } from "typeorm"
import * as cors from "cors"
import { Message } from "./entity/Message"

require("dotenv").config()
const SAMPLE_MEDIA =
  "https://dj9f81sjzts54.cloudfront.net/profile_maps/37086/static_map_fe6831b945e88139741de0d92152ceff.png"
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
      prev[curr.patronPhone] = []
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
    response = intentSpecificExpansion(response, "whereAreYouLocated") // TODO: make dynamic
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
  whereAreYouLocated: message => {
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
