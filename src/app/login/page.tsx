'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RobinIcon } from '@/components/icons/robin-icon';
import { useState, useRef, useEffect } from 'react';

const loginSchema = z.object({
  email: z.string().email('Invalid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

const signupSchema = z.object({
    name: z.string().min(2, 'Name is required.'),
    email: z.string().email('Invalid email address.'),
    password: z.string().min(6, 'Password must be at least 6 characters.'),
});

const phoneSchema = z.object({
    phone: z.string().min(10, 'Please enter a valid phone number.'),
});

const codeSchema = z.object({
    code: z.string().min(6, 'Verification code must be 6 digits.'),
});


type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;
type PhoneFormValues = z.infer<typeof phoneSchema>;
type CodeFormValues = z.infer<typeof codeSchema>;


export default function LoginPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isSubmittingPhone, setIsSubmittingPhone] = useState(false);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (auth && recaptchaContainerRef.current) {
        // cleanup previous verifier
        if ((window as any).recaptchaVerifier) {
            (window as any).recaptchaVerifier.clear();
        }
      const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
        size: 'invisible',
        'callback': () => {
          // reCAPTCHA solved, allow signInWithPhoneNumber.
        }
      });
      (window as any).recaptchaVerifier = recaptchaVerifier;
    }
  }, [auth]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  
  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });

  const codeForm = useForm<CodeFormValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });


  const onLoginSubmit = async (data: LoginFormValues) => {
    if (!auth) {
        toast({ variant: 'destructive', title: 'Auth not ready', description: 'Please try again in a moment.' });
        return;
    }
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({ title: 'Login Successful', description: "Welcome back!" });
      router.push('/dashboard');
    } catch (error: any) {
      // If login fails, try to sign them up instead.
       try {
        await createUserWithEmailAndPassword(auth, data.email, data.password);
        toast({ title: 'New Account Created!', description: 'Welcome to LocalDink!' });
        router.push('/dashboard');
       } catch (signupError: any) {
         toast({
            variant: 'destructive',
            title: 'Login Failed',
            description: signupError.message || 'An unknown error occurred.',
         });
       }
    }
  };
  
  const onSignupSubmit = async (data: SignupFormValues) => {
    if (!auth) {
        toast({ variant: 'destructive', title: 'Auth not ready', description: 'Please try again in a moment.' });
        return;
    }
    try {
      await createUserWithEmailAndPassword(auth, data.email, data.password);
      // In a real app, you would also create a user document in Firestore here.
      toast({ title: 'Signup Successful', description: 'Welcome to LocalDink!' });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Signup Failed',
        description: error.message || 'An unknown error occurred.',
      });
    }
  };
  
  const onPhoneSubmit = async (data: PhoneFormValues) => {
    if (!auth) {
        toast({ variant: 'destructive', title: 'Auth not ready' });
        return;
    }
    setIsSubmittingPhone(true);
    try {
        const verifier = (window as any).recaptchaVerifier;
        const confirmation = await signInWithPhoneNumber(auth, data.phone, verifier);
        setConfirmationResult(confirmation);
        toast({ title: 'Verification Code Sent', description: 'Check your phone for a 6-digit code.'});
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'SMS Failed', description: error.message });
        console.error(error);
    } finally {
        setIsSubmittingPhone(false);
    }
  };

  const onCodeSubmit = async (data: CodeFormValues) => {
    if (!confirmationResult) {
        toast({ variant: 'destructive', title: 'No confirmation pending' });
        return;
    }
     codeForm.formState.isSubmitting = true;
    try {
        await confirmationResult.confirm(data.code);
        toast({ title: 'Phone Verification Successful', description: "Welcome to LocalDink!" });
        router.push('/dashboard');
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Verification Failed', description: error.message });
    } finally {
        codeForm.formState.isSubmitting = false;
    }
  }


  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div ref={recaptchaContainerRef}></div>
        <div className="w-full max-w-md">
            <div className="text-center mb-6">
                <RobinIcon className="h-16 w-16 text-primary mx-auto mb-4" />
                <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Welcome to LocalDink</h1>
                <p className="text-muted-foreground mt-2">Sign in or create an account to start scheduling.</p>
            </div>

            <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="login">Log In</TabsTrigger>
                    <TabsTrigger value="signup">Sign Up</TabsTrigger>
                    <TabsTrigger value="phone">Phone</TabsTrigger>
                </TabsList>
                
                <TabsContent value="login">
                    <Card>
                        <CardHeader>
                            <CardTitle>Log In with Email</CardTitle>
                            <CardDescription>Enter your credentials to access your account.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form {...loginForm}>
                                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                                    <FormField
                                        control={loginForm.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl><Input placeholder="you@example.com" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={loginForm.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Password</FormLabel>
                                                <FormControl><Input type="password" placeholder="password" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting}>
                                        {loginForm.formState.isSubmitting ? 'Logging In...' : 'Log In / Sign Up'}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="signup">
                    <Card>
                        <CardHeader>
                            <CardTitle>Sign Up</CardTitle>
                            <CardDescription>Create a new account to get started.</CardDescription>
                        </CardHeader>
                        <CardContent>
                           <Form {...signupForm}>
                                <form onSubmit={signupForm.handleSubmit(onSignupSubmit)} className="space-y-4">
                                    <FormField
                                        control={signupForm.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Full Name</FormLabel>
                                                <FormControl><Input placeholder="Alex Johnson" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={signupForm.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl><Input placeholder="you@example.com" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={signupForm.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Password</FormLabel>
                                                <FormControl><Input type="password" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full" disabled={signupForm.formState.isSubmitting}>
                                        {signupForm.formState.isSubmitting ? 'Creating Account...' : 'Sign Up'}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="phone">
                    <Card>
                        {!confirmationResult ? (
                         <>
                            <CardHeader>
                                <CardTitle>Sign In with Phone</CardTitle>
                                <CardDescription>We'll send a one-time code to your phone.</CardDescription>
                            </CardHeader>
                            <CardContent>
                               <Form {...phoneForm}>
                                    <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                                        <FormField
                                            control={phoneForm.control}
                                            name="phone"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Phone Number</FormLabel>
                                                    <FormControl><Input placeholder="+1 555-123-4567" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <Button type="submit" className="w-full" disabled={isSubmittingPhone}>
                                            {isSubmittingPhone ? 'Sending...' : 'Send Code'}
                                        </Button>
                                    </form>
                                </Form>
                            </CardContent>
                         </>
                        ) : (
                         <>
                            <CardHeader>
                                <CardTitle>Enter Verification Code</CardTitle>
                                <CardDescription>A 6-digit code was sent to your phone.</CardDescription>
                            </CardHeader>
                            <CardContent>
                               <Form {...codeForm}>
                                    <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
                                        <FormField
                                            control={codeForm.control}
                                            name="code"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Verification Code</FormLabel>
                                                    <FormControl><Input placeholder="123456" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <Button type="submit" className="w-full" disabled={codeForm.formState.isSubmitting}>
                                            {codeForm.formState.isSubmitting ? 'Verifying...' : 'Verify & Sign In'}
                                        </Button>
                                    </form>
                                </Form>
                            </CardContent>
                         </>
                        )}
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    </div>
  );
}
