/** Integrations deliberately fail closed until a real provider is configured and tested. */
export interface PaymentAdapter {
  createCheckout(input:{clinicId:string;subscriptionInvoiceId:string;amountMinor:number;currency:string}):Promise<{url:string;providerReference:string}>;
  verifyWebhook(rawBody:Uint8Array,signature:string):Promise<{eventId:string;invoiceId:string;status:'paid'|'failed';occurredAt:string}>;
}
export interface ReminderAdapter {
  send(input:{destination:string;appointmentTime:string;clinicName:string;idempotencyKey:string}):Promise<{providerId:string;status:'accepted'|'delivered'}>;
}
export class NotConnectedError extends Error{constructor(){super('NOT_CONNECTED')}}
export const paymentAdapter:PaymentAdapter={async createCheckout(){throw new NotConnectedError()},async verifyWebhook(){throw new NotConnectedError()}};
export const reminderAdapter:ReminderAdapter={async send(){throw new NotConnectedError()}};
