'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { addPlayerAction } from '@/lib/actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

interface ParsedContact {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

// Check if the Contact Picker API is available (Android Chrome)
function hasContactPicker(): boolean {
  return typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
}

// Parse VCF (vCard) file content into contacts
function parseVcf(text: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  const cards = text.split('BEGIN:VCARD');

  for (const card of cards) {
    if (!card.includes('END:VCARD')) continue;

    let firstName = '';
    let lastName = '';
    let phone = '';
    let email = '';

    const lines = card.split(/\r?\n/);
    for (const line of lines) {
      // Name: N:LastName;FirstName;...
      if (line.startsWith('N:') || line.startsWith('N;')) {
        const value = line.replace(/^N[;:][^:]*:?/, '').replace(/^N:/, '');
        const nameValue = line.includes(':') ? line.split(':').slice(1).join(':') : value;
        const parts = nameValue.split(';');
        lastName = (parts[0] || '').trim();
        firstName = (parts[1] || '').trim();
      }

      // Fallback: FN (formatted name)
      if (line.startsWith('FN:') && !firstName && !lastName) {
        const fullName = line.substring(3).trim();
        const parts = fullName.split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }

      // Phone
      if (line.startsWith('TEL') && !phone) {
        const match = line.match(/:([\d+\-() .]+)/);
        if (match) {
          phone = match[1].replace(/[^+\d]/g, '');
        }
      }

      // Email
      if (line.startsWith('EMAIL') && !email) {
        const match = line.match(/:(.+)/);
        if (match) {
          email = match[1].trim();
        }
      }
    }

    if (firstName || lastName) {
      contacts.push({ firstName, lastName, phone, email });
    }
  }

  return contacts;
}

export function ImportContactsButton() {
  const { user } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleContactPicker = useCallback(async () => {
    if (!hasContactPicker()) return;

    try {
      const props = ['name', 'tel', 'email'];
      // @ts-expect-error Contact Picker API types not in lib.dom
      const contacts = await navigator.contacts.select(props, { multiple: true });

      const parsed: ParsedContact[] = contacts.map((c: any) => {
        const name = c.name?.[0] || '';
        const parts = name.split(' ');
        return {
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' ') || '',
          phone: (c.tel?.[0] || '').replace(/[^+\d]/g, ''),
          email: c.email?.[0] || '',
        };
      }).filter((c: ParsedContact) => c.firstName || c.lastName);

      if (parsed.length === 0) {
        toast({ title: 'No Contacts', description: 'No contacts were selected.' });
        return;
      }

      setParsedContacts(parsed);
      setSelectedIndices(new Set(parsed.map((_, i) => i)));
      setIsDialogOpen(true);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Contact Picker error:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not access contacts.' });
      }
    }
  }, [toast]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be selected again
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseVcf(text);

      if (parsed.length === 0) {
        toast({ variant: 'destructive', title: 'No Contacts Found', description: 'Could not find any contacts in that file.' });
        return;
      }

      setParsedContacts(parsed);
      setSelectedIndices(new Set(parsed.map((_, i) => i)));
      setIsDialogOpen(true);
    };
    reader.readAsText(file);
  }, [toast]);

  const handleImport = async () => {
    if (!user || selectedIndices.size === 0) return;

    setIsImporting(true);
    let successCount = 0;
    let failCount = 0;

    const contactsToImport = parsedContacts.filter((_, i) => selectedIndices.has(i));

    for (const contact of contactsToImport) {
      try {
        const result = await addPlayerAction(
          {
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email || '',
            phone: contact.phone || '',
          },
          user.uid
        );
        if (result.success) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    setIsImporting(false);
    setIsDialogOpen(false);
    setParsedContacts([]);
    setSelectedIndices(new Set());

    if (successCount > 0) {
      toast({
        title: `${successCount} Contact${successCount > 1 ? 's' : ''} Imported`,
        description: failCount > 0 ? `${failCount} failed to import.` : 'Added to your player roster.',
      });
    } else {
      toast({ variant: 'destructive', title: 'Import Failed', description: 'Could not import any contacts.' });
    }
  };

  const toggleContact = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIndices.size === parsedContacts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(parsedContacts.map((_, i) => i)));
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".vcf,.vcard"
        className="hidden"
        onChange={handleFileUpload}
      />

      {hasContactPicker() ? (
        // Android: use Contact Picker API
        <Button variant="outline" onClick={handleContactPicker}>
          <UserPlus className="-ml-1 mr-2 h-4 w-4" />
          Import Contacts
        </Button>
      ) : (
        // iOS / Desktop: VCF file upload
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="-ml-1 mr-2 h-4 w-4" />
          Import Contacts
        </Button>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Contacts</DialogTitle>
            <DialogDescription>
              Select the contacts you want to add to your player roster.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 pb-2 border-b">
            <Checkbox
              checked={selectedIndices.size === parsedContacts.length}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm font-medium">
              Select All ({selectedIndices.size}/{parsedContacts.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 py-2">
            {parsedContacts.map((contact, i) => (
              <label
                key={i}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedIndices.has(i)}
                  onCheckedChange={() => toggleContact(i)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[contact.phone, contact.email].filter(Boolean).join(' · ') || 'No contact info'}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isImporting}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={isImporting || selectedIndices.size === 0}>
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${selectedIndices.size} Contact${selectedIndices.size !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
