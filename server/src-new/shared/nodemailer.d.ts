declare module "nodemailer" {
  const nodemailer: {
    createTransport(options: Record<string, unknown>): {
      sendMail(options: Record<string, unknown>): Promise<unknown>;
    };
  };
  export = nodemailer;
}
