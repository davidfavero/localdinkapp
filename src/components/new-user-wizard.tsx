'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RobinIcon } from '@/components/icons/robin-icon';
import { PickleballBallIcon } from '@/components/icons/pickleball-ball-icon';
import { Check, ChevronRight, MapPin, Users, Calendar, Sparkles, Bell, MessageSquare } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { NotificationPreferences } from '@/lib/types';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types';
import { useUser, useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { addCourtAction, addPlayerAction } from '@/lib/actions';
import { useRouter } from 'next/navigation';

type WizardStep = 'welcome' | 'profile' | 'notifications' | 'court' | 'players' | 'complete';

interface NewUserWizardProps {
  open: boolean;
  onComplete: () => void;
}

export function NewUserWizard({ open, onComplete }: NewUserWizardProps) {
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  
  const [step, setStep] = useState<WizardStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);
  
  // Profile form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Court form state
  const [courtName, setCourtName] = useState('');
  const [courtLocation, setCourtLocation] = useState('');
  
  // Player form state
  const [playerFirstName, setPlayerFirstName] = useState('');
  const [playerLastName, setPlayerLastName] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [addedPlayers, setAddedPlayers] = useState<string[]>([]);
  
  // Notification preferences state
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const detectedTimezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'America/New_York';

  const normalizePhoneForStorage = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';

    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length === 10) return `+1${digitsOnly}`;
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) return `+${digitsOnly}`;
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15) return `+${digitsOnly}`;
    return trimmed;
  };
  
  // Initialize with current profile data
  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);
  
  const handleSaveProfile = async () => {
    if (!user || !firestore) return;
    
    setIsLoading(true);
    try {
      const userRef = doc(firestore, 'users', user.uid);
      await updateDoc(userRef, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalizePhoneForStorage(phone),
        timezone: profile?.timezone || detectedTimezone || 'America/New_York',
      });
      setStep('notifications');
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveNotifications = async () => {
    if (!user || !firestore) return;
    
    setIsLoading(true);
    try {
      const userRef = doc(firestore, 'users', user.uid);
      await updateDoc(userRef, {
        notificationPreferences: notificationPrefs,
      });
      setStep('court');
    } catch (error) {
      console.error('Error saving notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAddCourt = async () => {
    if (!user || !courtName.trim()) {
      setStep('players');
      return;
    }
    
    setIsLoading(true);
    try {
      await addCourtAction({
        name: courtName.trim(),
        location: courtLocation.trim(),
        timezone: profile?.timezone || detectedTimezone || 'America/New_York',
      }, user.uid);
      setStep('players');
    } catch (error) {
      console.error('Error adding court:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAddPlayer = async () => {
    if (!user || !playerFirstName.trim()) return;
    
    setIsLoading(true);
    try {
      const result = await addPlayerAction({
        firstName: playerFirstName.trim(),
        lastName: playerLastName.trim(),
        phone: playerPhone.trim() || undefined,
      }, user.uid);
      
      if (result.success) {
        setAddedPlayers(prev => [...prev, `${playerFirstName} ${playerLastName}`.trim()]);
        setPlayerFirstName('');
        setPlayerLastName('');
        setPlayerPhone('');
      }
    } catch (error) {
      console.error('Error adding player:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleComplete = () => {
    onComplete();
    // Navigate to Robin to start scheduling
    router.push('/dashboard');
  };
  
  const handleSkipToRobin = () => {
    onComplete();
    router.push('/dashboard');
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        {step === 'welcome' && (
          <>
            <DialogHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary flex items-center justify-center">
                <RobinIcon className="h-10 w-10 text-accent" />
              </div>
              <DialogTitle className="text-2xl flex items-center justify-center gap-2">
                Welcome to LocalDink! <PickleballBallIcon className="h-6 w-6 inline-block" ballColor="#c4d64f" holeColor="#333" />
              </DialogTitle>
              <DialogDescription className="text-base mt-2">
                I'm Robin, your AI scheduling assistant. Let me help you get set up so you can start playing pickleball with friends!
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-3 text-sm">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <span>Add your favorite playing partners</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <span>Save your home court</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                <span>Schedule games with natural language</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setStep('profile')} className="w-full">
                Let's Get Started
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={handleSkipToRobin} className="w-full text-muted-foreground">
                Skip for now
              </Button>
            </div>
          </>
        )}
        
        {step === 'profile' && (
          <>
            <DialogHeader>
              <DialogTitle>Tell me about yourself</DialogTitle>
              <DialogDescription>
                This helps me personalize your experience and let other players recognize you.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">First Name</label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Your first name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Last Name</label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Your last name"
                  />
                </div>
              </div>
              {/* Only show phone field if not already set from phone auth */}
              {!profile?.phone && (
                <div>
                  <label className="text-sm font-medium">Phone (optional)</label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="For game reminders"
                    type="tel"
                  />
                </div>
              )}
              {profile?.phone && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Phone number saved from sign-in
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('welcome')}>
                Back
              </Button>
              <Button onClick={handleSaveProfile} disabled={!firstName.trim() || isLoading} className="flex-1">
                {isLoading ? 'Saving...' : 'Continue'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
        
        {step === 'notifications' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                How should I notify you?
              </DialogTitle>
              <DialogDescription>
                Choose how you want to hear about game invites and updates.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Bell className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">In-App Notifications</label>
                    <p className="text-xs text-muted-foreground">Bell icon in the app</p>
                  </div>
                </div>
                <Switch
                  checked={notificationPrefs.channels.inApp}
                  onCheckedChange={(checked) => setNotificationPrefs(prev => ({
                    ...prev,
                    channels: { ...prev.channels, inApp: checked }
                  }))}
                />
              </div>
              
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-100">
                    <MessageSquare className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">SMS Text Messages</label>
                    <p className="text-xs text-muted-foreground">
                      {(profile?.phone || phone) 
                        ? 'Get texts for game invites' 
                        : 'Add phone number to enable'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notificationPrefs.channels.sms}
                  onCheckedChange={(checked) => setNotificationPrefs(prev => ({
                    ...prev,
                    channels: { ...prev.channels, sms: checked }
                  }))}
                  disabled={!profile?.phone && !phone}
                />
              </div>
              
              {(profile?.phone || phone) && notificationPrefs.channels.sms && (
                <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                  📱 SMS will be sent to {profile?.phone || phone}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('profile')}>
                Back
              </Button>
              <Button onClick={handleSaveNotifications} disabled={isLoading} className="flex-1">
                {isLoading ? 'Saving...' : 'Continue'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
        
        {step === 'court' && (
          <>
            <DialogHeader>
              <DialogTitle>Add your home court 🏟️</DialogTitle>
              <DialogDescription>
                Where do you usually play? This makes scheduling faster.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Court Name</label>
                <Input
                  value={courtName}
                  onChange={(e) => setCourtName(e.target.value)}
                  placeholder="e.g., I'On Courts, Central Park"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Location (optional)</label>
                <Input
                  value={courtLocation}
                  onChange={(e) => setCourtLocation(e.target.value)}
                  placeholder="City or neighborhood"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('notifications')}>
                Back
              </Button>
              <Button onClick={handleAddCourt} disabled={isLoading} className="flex-1">
                {isLoading ? 'Adding...' : courtName.trim() ? 'Add Court' : 'Skip'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
        
        {step === 'players' && (
          <>
            <DialogHeader>
              <DialogTitle>Add your playing partners 👥</DialogTitle>
              <DialogDescription>
                Who do you usually play with? Add them to invite them to games.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {addedPlayers.length > 0 && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Added:</label>
                  <div className="flex flex-wrap gap-2">
                    {addedPlayers.map((name, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 rounded-full text-sm">
                        <Check className="h-3 w-3 text-primary" />
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">First Name</label>
                  <Input
                    value={playerFirstName}
                    onChange={(e) => setPlayerFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Last Name</label>
                  <Input
                    value={playerLastName}
                    onChange={(e) => setPlayerLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Phone (optional)</label>
                <Input
                  value={playerPhone}
                  onChange={(e) => setPlayerPhone(e.target.value)}
                  placeholder="To send SMS invites"
                  type="tel"
                />
              </div>
              <Button 
                variant="outline" 
                onClick={handleAddPlayer} 
                disabled={!playerFirstName.trim() || isLoading}
                className="w-full"
              >
                {isLoading ? 'Adding...' : '+ Add Another Player'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('court')}>
                Back
              </Button>
              <Button onClick={() => setStep('complete')} className="flex-1">
                {addedPlayers.length > 0 ? 'Continue' : 'Skip'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
        
        {step === 'complete' && (
          <>
            <DialogHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-green-600" />
              </div>
              <DialogTitle className="text-2xl">You're all set! 🎉</DialogTitle>
              <DialogDescription className="text-base mt-2">
                Your account is ready. You can now schedule games by chatting with me!
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Try saying:</strong> "Schedule a game tomorrow at 4pm at {courtName || 'my court'}"
                  </p>
                </CardContent>
              </Card>
            </div>
            <Button onClick={handleComplete} className="w-full">
              <RobinIcon className="mr-2 h-5 w-5" />
              Start Chatting with Robin
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

