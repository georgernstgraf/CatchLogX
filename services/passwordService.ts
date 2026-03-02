import { prisma } from "@/lib/prisma";
import * as crypto from "crypto";
import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import bcrypt from "bcrypt";

type UserEmailType = {
  email: string;
};

type FindUserType = {
  exists: boolean | null;
  error: number | undefined;
  error_message: string | null;
  data: UserEmailType | null;
};

export async function findUserOrThrow(username: string): Promise<FindUserType> {
  try {
    const userData = await prisma.user.findFirst({
      where: {
        username: username,
      },
      select: {
        email: true,
      },
    });

    if (!userData) {
      return {
        exists: false,
        error: 404,
        error_message: "User not found.",
        data: null,
      };
    }

    return {
      exists: true,
      error: undefined,
      error_message: null,
      data: userData,
    };
  } catch (e) {
    console.log("Error occurred while trying to find user: ", e);
    return {
      exists: null,
      error: 500,
      error_message: "Internal server error while processing your request.",
      data: null,
    };
  }
}

export function createResetToken(): string {
  const token = crypto.randomBytes(24).toString("hex");
  return token;
}

export async function initiatePasswordReset(
  username: string,
  timestamp: string,
  email: string,
) {
  const resetToken = createResetToken();

  try {
    const existingResets = await prisma.passwordResets.findMany({
      where: {
        username: username,
      },
    });
    if (existingResets.length > 0) {
      await prisma.passwordResets.updateMany({
        data: {
          state: "EXPIRED",
        },
        where: {
          username: username,
        },
      });
    }
    await prisma.passwordResets.create({
      data: {
        username: username,
        timestamp: new Date(timestamp),
        state: "REQUESTED",
        token: resetToken,
      },
    });
  } catch (e) {
    console.error(
      "Error while creating password reset entry in DB. Error: ",
      e,
    );
  }

  const transporter = nodemailer.createTransport({
    host: process.env.NODEMAILER_HOST,
    port: process.env.NODEMAILER_PORT,
    secure: process.env.NODEMAILER_SECURE,
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASSWORD,
    },
  } as SMTPTransport.Options);

  const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`;

  const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Request</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f7;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f7;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #e8e8e8;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Password Reset Request</h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #4a4a4a;">
                Hello <strong>${username}</strong>,
              </p>
              
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #4a4a4a;">
                We received a request to reset the password for your CatchLogX account. If you didn't make this request, you can safely ignore this email.
              </p>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #4a4a4a;">
                To reset your password, click the button below:
              </p>
              
              <!-- Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0 0 24px;">
                    <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500; transition: background-color 0.2s;">Reset Password</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              
              <p style="margin: 0 0 24px; padding: 12px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 14px; word-break: break-all; color: #374151;">
                ${resetLink}
              </p>
              
              <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #6b7280;">
                <strong>Important:</strong> This link will expire in 15 minutes for security reasons.
              </p>
              
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                If you're having trouble, please contact our support team.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e8e8e8; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: #6b7280; text-align: center;">
                Best regards,<br>
                <strong>The CatchLogX Team</strong>
              </p>
              
              <p style="margin: 16px 0 0; font-size: 12px; line-height: 1.5; color: #9ca3af; text-align: center;">
                This is an automated message, please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer Note -->
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 0 40px; text-align: center;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #9ca3af;">
                © ${new Date().getFullYear()} CatchLogX. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;

  await transporter.sendMail({
    from: `"CatchLogX" <${process.env.NODEMAILER_USER}>`,
    to: email,
    subject: "Password Reset Request",
    html: emailHtml,
    text: `Hello ${username},\n\nWe received a request to reset the password for your CatchLogX account. If you didn't make this request, you can safely ignore this email.\n\nTo reset your password, visit this link:\n${resetLink}\n\nThis link will expire in 24 hours for security reasons.\n\nBest regards,\nThe CatchLogX Team`,
  });
}

export async function validateResetToken(token: string) {
  const resetRequest = await prisma.passwordResets.findFirst({
    where: {
      token: token,
      state: "REQUESTED",
      timestamp: {
        gte: new Date(Date.now() - 1000 * 60 * 15),
      },
    },
  });

  if (!resetRequest) {
    return null;
  }

  await prisma.passwordResets.update({
    where: {
      id: resetRequest.id,
    },
    data: {
      state: "EXPIRED",
    },
  });

  return resetRequest;
}

export async function changePassword(
  username: string,
  newPassword: string,
  token: string,
) {
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: {
      username: username,
    },
    data: {
      hashedPassword: hashedPassword,
    },
  });

  await prisma.passwordResets.update({
    where: {
      token: token,
    },
    data: {
      state: "DONE",
      passwordChangedAt: new Date(),
    },
  });
}
