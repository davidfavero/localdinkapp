'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { players, courts } from '@/lib/data';
import { extractPreferencesAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { UserAvatar } from '@/components/user-avatar';
import { Sparkles } from 'lucide-react';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  doublesPreference: z.boolean().default(true),
  homeCourt: z.string().optional(),
  availability: z.string().optional(),
  profileText: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { toast } = useToast();
  const [isExtracting, setIsExtracting] = useState(false);
  const currentUser = players.find((p) => p.isCurrentUser);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: currentUser?.name || '',
      doublesPreference: true,
      homeCourt: courts.find(c => c.isHome)?.id || '',
      availability: 'Weekdays after 5 PM, flexible on weekends.',
      profileText: `I love playing competitive doubles. My home court is Sunnyvale Park but I can play anywhere in the South Bay. I'm usually free on weekdays after 5 PM and most times on weekends.`
    },
  });

  async function onSubmit(data: ProfileFormValues) {
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
      const foundCourt = courts.find(c => c.name.toLowerCase() === result.homeCourtPreference.toLowerCase());
      if (foundCourt) {
        form.setValue('homeCourt', foundCourt.id, { shouldValidate: true });
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

  if (!currentUser) return <p>Could not find user profile.</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
           <UserAvatar player={currentUser} className="h-20 w-20" />
           <div>
            <CardTitle className="text-3xl font-headline">{currentUser.name}</CardTitle>
            <CardDescription>Manage your profile and scheduling preferences.</CardDescription>
           </div>
        </CardHeader>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                name="homeCourt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Home Court</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your primary court" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {courts.map(court => (
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
    </div>
  );
}
