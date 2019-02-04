import * as Twilio from 'twilio'

export function sendSMS(phoneNumber: string = process.env.TRIAL_PHONE, message: string) {
  if (!phoneNumber) {
    throw Error('Phone number must be provided')
  }
  const { TWILIO_SID, TWILIO_TOKEN } = process.env
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    throw Error('Twilio credentials not found')
  }
  const client = new (Twilio as any)(TWILIO_SID, TWILIO_TOKEN)
  return  client.messages.create({
    body: message,
    to: phoneNumber,
    from: '+16292053840'
  })
}