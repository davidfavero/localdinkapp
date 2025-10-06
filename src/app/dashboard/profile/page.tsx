'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { extractPreferencesAction, seedDatabaseAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Database, AlertCircle, Camera, Upload } from 'lucide-react';
import { collection, query, doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { Court, Player } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCollection } from '@/firebase/firestore/use-collection';
import { UserAvatar } from '@/components/user-avatar';
import { ImageCropDialog } from '@/components/image-crop-dialog';
import { getCroppedImg } from '@/lib/crop-image';
import type { Area } from 'react-easy-crop';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';


const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  phone: z.string().optional(),
  dinkRating: z.string().optional(),
  doublesPreference: z.boolean().default(true),
  homeCourtId: z.string().optional(),
  availability: z.string().optional(),
  profileText: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { toast } = useToast();
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const { user } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);


  const playersQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users')) : null, [firestore]);
  const { data: players } = useCollection<Player>(playersQuery);
  const currentUser = players?.find((p) => p.id === user?.uid);

  const courtsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'courts')) : null, [firestore]);
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
      })
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
    if (!imageToCrop || !user || !storage || !firestore) return;

    setIsUploading(true);
    setImageToCrop(null); // Close dialog

    try {
      const croppedImageBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);
      if (!croppedImageBlob) {
        throw new Error('Failed to crop image.');
      }

      const avatarRef = storageRef(storage, `avatars/${user.uid}/profile.jpg`);
      const snapshot = await uploadBytes(avatarRef, croppedImageBlob);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      const userRef = doc(firestore, 'users', user.uid);
      updateDocumentNonBlocking(userRef, { avatarUrl: downloadURL });

      toast({
        title: 'Avatar Updated',
        description: 'Your new profile picture has been saved.',
      });

    } catch (error: any) {
      console.error('Error updating avatar:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not save your new avatar. Please try again.',
      });
    } finally {
      setIsUploading(false);
    }
  }, [imageToCrop, user, storage, firestore, toast]);

  async function onSubmit(data: ProfileFormValues) {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Cannot update profile. Not authenticated.',
      });
      return;
    }

    const userRef = doc(firestore, 'users', user.uid);
    const [firstName, ...lastNameParts] = data.name.split(' ');
    const lastName = lastNameParts.join(' ');
    
    updateDocumentNonBlocking(userRef, {
      firstName,
      lastName,
      phone: data.phone,
      dinkRating: data.dinkRating,
      doublesPreference: data.doublesPreference,
      homeCourtId: data.homeCourtId,
      availability: data.availability,
    });

    toast({
      title: 'Profile Updated',
      description: 'Your preferences have been saved.',
    });
  }

  async function handleExtractPreferences() {
    setIsExtracting(true);
    const profileText = form.getValues('profileText');
    if (!profileText) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please provide some text for the AI to analyze.',
      });
      setIsExtracting(false);
      return;
    }

    try {
      const result = await extractPreferencesAction({ profileText });
      form.setValue('doublesPreference', result.doublesPreference, { shouldValidate: true });
      const foundCourt = courts?.find(c => c.name.toLowerCase() === result.homeCourtPreference.toLowerCase());
      if (foundCourt) {
        form.setValue('homeCourtId', foundCourt.id, { shouldValidate: true });
      }
      form.setValue('availability', result.availability, { shouldValidate: true });
      toast({
        title: 'Preferences Extracted!',
        description: 'Robin has updated your preferences based on your text.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'AI Extraction Failed',
        description: 'Could not extract preferences. Please try again.',
      });
    } finally {
      setIsExtracting(false);
    }
  }
  
  async function onSeedDatabase() {
    setIsSeeding(true);
    try {
        const result = await seedDatabaseAction();
        if (result.success) {
            toast({
                title: 'Database Seeded!',
                description: result.message,
            });
        } else {
             toast({
                variant: 'destructive',
                title: 'Seeding Failed',
                description: result.message,
            });
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Seeding Failed',
            description: error.message || 'An unknown error occurred.',
        });
    } finally {
        setIsSeeding(false);
    }
  }

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
              <div className="relative group h-32 w-32">
                {currentUser ? (
                  <UserAvatar player={currentUser} className="h-32 w-32 text-4xl rounded-full z-0" />
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
                  {isUploading ? (
                    <Upload className="h-8 w-8 text-white animate-pulse" />
                  ) : (
                    <Camera className="h-8 w-8 text-white" />
                  )}
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
          </div>

          <Card>
            <CardHeader>
              <CardTitle>AI Preference Extraction</CardTitle>
              <CardDescription>
                Let Robin, our AI assistant, fill out your preferences for you. Just describe your playing style and availability below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="profileText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Profile Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., 'I prefer playing doubles at Mitchell Park. I'm available most weekday evenings...'"
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="button" onClick={handleExtractPreferences} disabled={isExtracting}>
                <Sparkles className="mr-2 h-4 w-4" />
                {isExtracting ? 'Robin is thinking...' : 'Extract with AI'}
              </Button>
            </CardContent>
          </Card>
          
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

          <Card>
              <CardHeader>
                  <CardTitle>Developer Settings</CardTitle>
                  <CardDescription>Actions for helping with app development.</CardDescription>
              </CardHeader>
              <CardContent>
                 <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Seed Database</AlertTitle>
                    <AlertDescription>
                        Clicking this button will populate your Firestore database with a default set of players and courts. This is useful for getting started and testing functionality. It will not delete or overwrite existing data.
                    </AlertDescription>
                </Alert>
              </CardContent>
              <CardFooter>
                 <Button type="button" variant="outline" onClick={onSeedDatabase} disabled={isSeeding}>
                    <Database className="mr-2 h-4 w-4" />
                    {isSeeding ? "Seeding..." : "Seed Database"}
                </Button>
              </CardFooter>
          </Card>

          <div className="flex justify-end">
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
