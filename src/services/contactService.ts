import prisma from '../utils/db';
import { Contact, LinkPrecedence } from '../types/contact';

class ContactService {
  async identifyContact(email?: string, phoneNumber?: string): Promise<Contact> {
    // 1. Find existing contacts matching email or phoneNumber
    let existingContacts: Contact[] = [];

    if (email && phoneNumber) {
      existingContacts = await prisma.contact.findMany({
        where: {
          OR: [
            { email: email },
            { phoneNumber: phoneNumber }
          ],
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      }) as Contact[];
    } else if (email) {
      existingContacts = await prisma.contact.findMany({
        where: { email: email, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }) as Contact[];
    } else if (phoneNumber) {
      existingContacts = await prisma.contact.findMany({
        where: { phoneNumber: phoneNumber, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }) as Contact[];
    } else {
      throw new Error("Either email or phoneNumber must be provided.");
    }


    // 2. Determine primary contact
    let primaryContact: Contact | null = null;
    let secondaryContacts: Contact[] = [];

    if (existingContacts.length > 0) {
      // Find the true primary contact among the found contacts
      const allLinkedIds: number[] = [];
      existingContacts.forEach(contact => {
        if (contact.linkedId) {
          allLinkedIds.push(contact.linkedId);
        }
      });

      // Find the oldest primary contact among all linked contacts
      const potentialPrimaryContacts = existingContacts.filter(contact => contact.linkPrecedence === 'primary');

      if (potentialPrimaryContacts.length > 0) {
        // Sort to get the oldest primary contact
        primaryContact = potentialPrimaryContacts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      } else {
        // This case should ideally not happen if links are maintained correctly,
        // but as a fallback, pick the oldest contact if no primary found among current set
        primaryContact = existingContacts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      }

      // Gather all contacts linked to the primary contact
      const allRelatedContacts = await prisma.contact.findMany({
        where: {
          OR: [
            { id: primaryContact.id },
            { linkedId: primaryContact.id },
            {
              id: {
                in: existingContacts.filter(c => c.linkedId === null && c.linkPrecedence === 'primary').map(c => c.id) // For cases where two primaries merge
              }
            }
          ],
          deletedAt: null
        }
      }) as Contact[];

      // If multiple primary contacts are found, link them to the oldest one
      const currentPrimaryIds = allRelatedContacts.filter(c => c.linkPrecedence === 'primary').map(c => c.id);
      if (currentPrimaryIds.length > 1) {
        const oldestPrimary = allRelatedContacts.filter(c => c.linkPrecedence === 'primary').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

        for (const contact of currentPrimaryIds) {
          if (contact !== oldestPrimary.id) {
            await prisma.contact.update({
              where: { id: contact },
              data: {
                linkedId: oldestPrimary.id,
                linkPrecedence: 'secondary',
              },
            });
          }
        }
        primaryContact = oldestPrimary;
      }

      // Re-fetch all related contacts after potential updates
      const finalRelatedContacts = await prisma.contact.findMany({
        where: {
          OR: [
            { id: primaryContact.id },
            { linkedId: primaryContact.id },
          ],
          deletedAt: null
        }
      }) as Contact[];

      secondaryContacts = finalRelatedContacts.filter(contact =>
        contact.id !== primaryContact?.id && contact.linkPrecedence === 'secondary'
      );

      // Check if new contact needs to be created or existing one updated
      const existingContactWithSameEmailAndPhone = finalRelatedContacts.find(c =>
        c.email === email && c.phoneNumber === phoneNumber
      );

      if (!existingContactWithSameEmailAndPhone) {
        // Create a new secondary contact if it's new information but links to an existing primary
        if ((email && !finalRelatedContacts.some(c => c.email === email)) ||
            (phoneNumber && !finalRelatedContacts.some(c => c.phoneNumber === phoneNumber))) {
          const newContact = await prisma.contact.create({
            data: {
              email: email,
              phoneNumber: phoneNumber,
              linkedId: primaryContact.id,
              linkPrecedence: 'secondary',
            },
          }) as Contact;
          secondaryContacts.push(newContact);
        }
      }

    } else {
      // No existing contacts, create a new primary contact
      primaryContact = await prisma.contact.create({
        data: {
          email: email,
          phoneNumber: phoneNumber,
          linkPrecedence: 'primary',
        },
      }) as Contact;
    }

    return primaryContact as Contact; // We ensure primaryContact is not null before returning
  }

  async getConsolidatedContact(primaryContactId: number): Promise<any> {
    const primary = await prisma.contact.findUnique({
      where: { id: primaryContactId },
    }) as Contact;

    if (!primary) {
      throw new Error("Primary contact not found.");
    }

    const secondary = await prisma.contact.findMany({
      where: {
        linkedId: primary.id,
        deletedAt: null,
      },
    }) as Contact[];

    const emails = new Set<string>();
    const phoneNumbers = new Set<string>();
    const secondaryContactIds: number[] = [];

    if (primary.email) emails.add(primary.email);
    if (primary.phoneNumber) phoneNumbers.add(primary.phoneNumber);

    secondary.forEach(contact => {
      if (contact.email) emails.add(contact.email);
      if (contact.phoneNumber) phoneNumbers.add(contact.phoneNumber);
      secondaryContactIds.push(contact.id);
    });

    return {
      primaryContatctId: primary.id,
      emails: Array.from(emails),
      phoneNumbers: Array.from(phoneNumbers),
      secondaryContactIds: secondaryContactIds,
    };
  }
}

export default new ContactService();
