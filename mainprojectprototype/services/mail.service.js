/**
 * mail.service.js - SMTP Email Notification Service (Modern ES Module with Dotenv)
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';

const isProduction = process.env.NODE_ENV === 'production';
const mailSettings = isProduction
  ? {
      mode: 'production SMTP',
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM
    }
  : {
      mode: 'development Mailtrap',
      host: process.env.MAILTRAP_SMTP_HOST,
      port: Number(process.env.MAILTRAP_SMTP_PORT || 2525),
      secure: String(process.env.MAILTRAP_SMTP_SECURE || 'false').toLowerCase() === 'true',
      user: process.env.MAILTRAP_SMTP_USER,
      pass: process.env.MAILTRAP_SMTP_PASS,
      from: process.env.MAILTRAP_SMTP_FROM
    };

const missingMailSettings = ['host', 'user', 'pass', 'from']
  .filter(setting => !mailSettings[setting]);

if (missingMailSettings.length > 0) {
  throw new Error(
    `${mailSettings.mode} email configuration is incomplete. Missing: ${missingMailSettings.join(', ')}`
  );
}

const transporter = nodemailer.createTransport({
  host: mailSettings.host,
  port: mailSettings.port,
  secure: mailSettings.secure,
  auth: {
    user: mailSettings.user,
    pass: mailSettings.pass
  }
});

console.log(`✉ Email provider: ${mailSettings.mode} (${mailSettings.host}:${mailSettings.port})`);

export const sendAssignmentReminderEmail = async (userEmail, assignments) => {
  const pendingAssignments = assignments.filter(a => !a.is_submitted);

  const htmlContent = `
    <h2>📚 VOLP Assignment Reminder</h2>
    <p>Hello <strong>${userEmail}</strong>,</p>
    <p>Here is your summary of pending assignments:</p>

    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr style="background-color: #f2f2f2;">
          <th>Course</th>
          <th>Type</th>
          <th>Assignment / Prompt</th>
          <th>Due Date</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${pendingAssignments.map(a => `
          <tr>
            <td>${a.course_name}</td>
            <td><strong>${a.assignment_type}</strong></td>
            <td>${a.title_html}</td>
            <td>${a.due_date_raw}</td>
            <td style="color: red;"><strong>Pending</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <br/>
    <p>Good luck with your submissions!</p>
  `;

  const info = await transporter.sendMail({
    from: mailSettings.from,
    to: userEmail,
    subject: `VOLP Reminder: ${pendingAssignments.length} Pending Assignment(s)`,
    html: htmlContent
  });

  console.log(`✓ Reminder email sent to ${userEmail}. Message ID: ${info.messageId}`);
  return true;
};
