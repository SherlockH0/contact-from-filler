import nodemailer from "nodemailer";
import { inputFromStdin } from "./utils/input.js";

const input = await inputFromStdin();

const { host, port, secure, username, password, from, to, subject, text } =
  input;

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: {
    user: username,
    pass: password,
  },
});

const mailOptions = {
  from,
  to,
  subject,
  text,
};

transporter.sendMail(mailOptions, function (error, info) {
  const status = {
    success: !error,
    error: error || null,
    info: info || null,
  };
  console.log(JSON.stringify(status, null, 2));
});
