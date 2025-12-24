'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFirestore, useUser, useMemoFirebase } from '@/firebase/provider';
import { errorEmitter } from '@/firebase/error-emitter';
import { getStorage } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, Bell, MessageSquare, Smartphone } from 'lucide-react';
import { collection, query, doc, updateDoc, where } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { Court, Player, NotificationPreferences } from '@/lib/types';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCollection } from '@/firebase/firestore/use-collection';
import { UserAvatar } from '@/components/user-avatar';
import { ImageCropDialog } from '@/components/image-crop-dialog';
import { getCroppedImg } from '@/lib/crop-image';
import type { Area } from 'react-easy-crop';
import { FirestorePermissionError } from '@/firebase/errors';
import { getClientApp } from '@/firebase/app';


const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  phone: z.string().optional(),
  dinkRating: z.string().optional(),
  doublesPreference: z.boolean().default(true),
  homeCourtId: z.string().optional(),
  availability: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { toast } = useToast();
  const { user, profile: currentUser } = useUser();
  const firestore = useFirestore();
  const storage = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return getStorage(getClientApp());
    } catch (error) {
      console.error('Failed to initialize Firebase storage on the client:', error);
      return null;
    }
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  const courtsQuery = useMemoFirebase(
    () => firestore && user?.uid ? query(collection(firestore, 'courts'), where('ownerId', '==', user.uid)) : null, 
    [firestore, user?.uid]
  );
  const { data: courts, isLoading: isLoadingCourts } = useCollection<Court>(courtsQuery);
  
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      phone: '',
      dinkRating: '4.25', // Placeholder
      doublesPreference: true,
      homeCourtId: '', // This will be populated from user profile later
      availability: 'Weekdays after 5 PM, flexible on weekends.', // placeholder
      profileText: `I love playing competitive doubles. My home court is Sunnyvale Park but I can play anywhere in the South Bay. I'm usually free on weekdays after 5 PM and most times on weekends.`
    },
  });
  
  useEffect(() => {
    if (currentUser) {
      form.reset({
        name: `${currentUser.firstName} ${currentUser.lastName}`,
        phone: currentUser.phone || '',
        dinkRating: currentUser.dinkRating || '4.25',
        doublesPreference: currentUser.doublesPreference ?? true,
        homeCourtId: currentUser.homeCourtId || '',
        availability: currentUser.availability || 'Weekdays after 5 PM, flexible on weekends.',
      });
      // Load notification preferences
      if (currentUser.notificationPreferences) {
        setNotificationPrefs(currentUser.notificationPreferences);
      }
    }
  }, [currentUser, form]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        toast({
            variant: 'destructive',
            title: 'Invalid File Type',
            description: 'Please select an image file (e.g., PNG, JPG).',
        });
        return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        variant: 'destructive',
        title: 'Image Too Large',
        description: 'Please select an image smaller than 5MB.',
      });
      return;
    }
    
    const reader = new FileReader();
    reader.addEventListener('load', () => {
        setImageToCrop(reader.result as string);
    });
    reader.readAsDataURL(file);
    
    // Reset file input to allow re-selecting the same file
    if(fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };
  
 const handleCropComplete = useCallback(async (croppedAreaPixels: Area) => {
    if (!imageToCrop || !storage || !firestore) {
      toast({ variant: 'destructive', title: 'Not ready', description: 'Missing Firebase instances.' });
      return;
    }

    // Require authentication - user should be authenticated in dev mode
    if (!user?.uid) {
      toast({ 
        variant: 'destructive', 
        title: 'Not Authenticated', 
        description: 'Please sign in to upload photos.' 
      });
      return;
    }
    const userId = user.uid;

    const dataUrl = imageToCrop;
    setIsUploading(true);
    setImageToCrop(null);

    try {
      const croppedImageBlob = await getCroppedImg(dataUrl, croppedAreaPixels);
      if (!croppedImageBlob) throw new Error('Failed to crop image.');

      const avatarRef = storageRef(storage, `avatars/${userId}/profile.jpg`);
      const snapshot = await uploadBytes(avatarRef, croppedImageBlob);
      
      const downloadURL = await getDownloadURL(snapshot.ref);

      const userRef = doc(firestore, 'users', userId);
      
      const payload = { avatarUrl: downloadURL };

      updateDoc(userRef, payload)
        .then(() => {
          toast({
            title: 'Avatar Updated',
            description: 'Your new profile picture has been saved.',
          });
        })
        .catch((error) => {
            const permissionError = new FirestorePermissionError({
              path: userRef.path,
              operation: 'update',
              requestResourceData: payload,
            });
            errorEmitter.emit('permission-error', permissionError);
            toast({
              variant: 'destructive',
              title: 'Update Failed',
              description: 'Could not save your new avatar. Check permissions and try again.',
            });
        });

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error?.message ?? 'Could not save your new avatar. Please try again.',
      });
    } finally {
      setIsUploading(false);
    }
  }, [imageToCrop, user, storage, firestore, toast]);


  function onSubmit(data: ProfileFormValues) {
    if (!firestore) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Cannot update profile. Firebase not ready.',
      });
      return;
    }

    // Require authentication - user should be authenticated in dev mode
    if (!user?.uid) {
      toast({ 
        variant: 'destructive', 
        title: 'Not Authenticated', 
        description: 'Please sign in to update your profile.' 
      });
      return;
    }
    const userId = user.uid;
    const userRef = doc(firestore, 'users', userId);
    const [firstName, ...lastNameParts] = data.name.split(' ');
    const lastName = lastNameParts.join(' ');
    
    const payload = {
      firstName,
      lastName,
      phone: data.phone,
      dinkRating: data.dinkRating,
      doublesPreference: data.doublesPreference,
      homeCourtId: data.homeCourtId,
      availability: data.availability,
    };
    
    updateDoc(userRef, payload)
      .then(() => {
        toast({
          title: 'Profile Updated',
          description: 'Your preferences have been saved.',
        });
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
          path: userRef.path,
          operation: 'update',
          requestResourceData: payload,
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: 'Could not save your profile. Check permissions and try again.',
        });
      });
  }

  const handleNotificationPrefChange = (
    category: 'channels' | 'types',
    key: string,
    value: boolean
  ) => {
    setNotificationPrefs(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value,
      },
    }));
  };

  const saveNotificationPreferences = async () => {
    if (!firestore || !user?.uid) return;
    
    setIsSavingNotifications(true);
    const userRef = doc(firestore, 'users', user.uid);
    
    try {
      await updateDoc(userRef, {
        notificationPreferences: notificationPrefs,
      });
      toast({
        title: 'Notification Settings Saved',
        description: 'Your notification preferences have been updated.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not save notification settings. Please try again.',
      });
    } finally {
      setIsSavingNotifications(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {imageToCrop && (
        <ImageCropDialog 
            image={imageToCrop}
            onCropComplete={handleCropComplete}
            onClose={() => setImageToCrop(null)}
        />
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          <div className="flex justify-center">
            <div className="relative group h-32 w-32">
                {isUploading ? (
                  <div className="h-32 w-32 rounded-full bg-muted flex items-center justify-center text-3xl z-0">
                    <Upload className="h-12 w-12 text-muted-foreground animate-pulse" />
                  </div>
                ) : currentUser ? (
                  <UserAvatar player={currentUser} className="h-32 w-32 text-4xl" />
                ) : (
                  <div className="h-32 w-32 rounded-full bg-muted flex items-center justify-center text-3xl z-0">
                    <Camera/>
                  </div>
                )}
            
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={isUploading}
                  aria-label="Change avatar"
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                >
                  <Camera className="h-8 w-8 text-white" />
                </button>
            
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/png, image/jpeg, image/webp"
                />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Your Preferences</CardTitle>
              <CardDescription>These settings help Robin schedule the perfect game for you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 555-123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="dinkRating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dink Rating</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 4.5 or DUPR 4.5" {...field} />
                    </FormControl>
                     <FormDescription>
                      Add your own rating, perhaps your DUPR rating, here to help you align with other players of your level.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="doublesPreference"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Prefer Doubles</FormLabel>
                      <FormDescription>
                        Enable if you generally prefer playing doubles.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="homeCourtId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Home Court</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger disabled={isLoadingCourts}>
                          <SelectValue placeholder={isLoadingCourts ? "Loading..." : "Select your primary court"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {courts?.map(court => (
                          <SelectItem key={court.id} value={court.id}>{court.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="availability"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>General Availability</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., 'Weekdays after 6 PM, anytime on weekends.'"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Form>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>
            Choose how you want to be notified about games and updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Notification Channels */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Notification Channels</h4>
            
            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">In-App Notifications</label>
                  <p className="text-xs text-muted-foreground">
                    See notifications in the app's notification center
                  </p>
                </div>
              </div>
              <Switch
                checked={notificationPrefs.channels.inApp}
                onCheckedChange={(checked) => handleNotificationPrefChange('channels', 'inApp', checked)}
              />
            </div>
            
            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-100">
                  <MessageSquare className="h-4 w-4 text-green-600" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">SMS Notifications</label>
                  <p className="text-xs text-muted-foreground">
                    Get text messages for important updates
                    {!currentUser?.phone && (
                      <span className="block text-orange-600 mt-1">
                        Add a phone number above to enable SMS
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Switch
                checked={notificationPrefs.channels.sms}
                onCheckedChange={(checked) => handleNotificationPrefChange('channels', 'sms', checked)}
                disabled={!currentUser?.phone}
              />
            </div>
          </div>

          {/* Notification Types */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">What to Notify</h4>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Game Invitations</label>
                  <p className="text-xs text-muted-foreground">When someone invites you to play</p>
                </div>
                <Switch
                  checked={notificationPrefs.types.gameInvites}
                  onCheckedChange={(checked) => handleNotificationPrefChange('types', 'gameInvites', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Game Reminders</label>
                  <p className="text-xs text-muted-foreground">Reminders before your upcoming games</p>
                </div>
                <Switch
                  checked={notificationPrefs.types.gameReminders}
                  onCheckedChange={(checked) => handleNotificationPrefChange('types', 'gameReminders', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">RSVP Updates</label>
                  <p className="text-xs text-muted-foreground">When players accept or decline your invites</p>
                </div>
                <Switch
                  checked={notificationPrefs.types.rsvpUpdates}
                  onCheckedChange={(checked) => handleNotificationPrefChange('types', 'rsvpUpdates', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Game Changes</label>
                  <p className="text-xs text-muted-foreground">When game time or location changes</p>
                </div>
                <Switch
                  checked={notificationPrefs.types.gameChanges}
                  onCheckedChange={(checked) => handleNotificationPrefChange('types', 'gameChanges', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Spot Available</label>
                  <p className="text-xs text-muted-foreground">When you're moved off a waitlist</p>
                </div>
                <Switch
                  checked={notificationPrefs.types.spotAvailable}
                  onCheckedChange={(checked) => handleNotificationPrefChange('types', 'spotAvailable', checked)}
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={saveNotificationPreferences} 
            disabled={isSavingNotifications}
            className="ml-auto"
          >
            {isSavingNotifications ? 'Saving...' : 'Save Notification Settings'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
