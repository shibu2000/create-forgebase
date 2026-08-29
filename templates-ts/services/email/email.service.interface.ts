/**
 * The mail contract.
 *
 * Services depend on this, never on Nodemailer — swapping SMTP for a
 * provider API later is one new file implementing this interface, with no
 * change to any caller.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Always required: a text part is what keeps mail out of spam folders. */
  text: string;
  html?: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}
