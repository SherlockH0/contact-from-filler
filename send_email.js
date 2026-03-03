import nodemailer from "nodemailer";
import { inputFromStdin } from "./utils/input.js";

// const input = await inputFromStdin();

const { host, port, secure, username, password, from, to, subject, text } = {
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  username: "ddmlf7@gmail.com",
  password: "njrfhghrigdybmpr",
  to: "daniil.davtian@gmail.com",
  subject: "This is subject",
  text: "Nice to meet you, Arron! How are you\n\n\ndfadfa\nadf\n\nYou can book a quick no-commitment call here: https://calendly.com/d/cxnn-936-3ms/30-minute-meeting?utm_medium=email^&utm_content=",
};

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
