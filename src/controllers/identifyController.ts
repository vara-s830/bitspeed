import { Request, Response } from 'express';
import contactService from '../services/contactService';
import { IdentifyRequest, IdentifyResponse } from '../types/contact';

class IdentifyController {
  async identify(req: Request<{}, {}, IdentifyRequest>, res: Response<IdentifyResponse | string>) {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return res.status(400).send("Either email or phoneNumber must be provided.");
    }

    try {
      const primaryContact = await contactService.identifyContact(email, phoneNumber);
      const consolidatedContact = await contactService.getConsolidatedContact(primaryContact.id);
      return res.status(200).json({ contact: consolidatedContact });
    } catch (error: any) {
      console.error("Error during identification:", error);
      return res.status(500).send(error.message || "An unexpected error occurred.");
    }
  }
}

export default new IdentifyController();
