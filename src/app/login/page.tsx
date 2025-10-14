'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth, useToast } from '@/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RobinIcon } from '@/components/icons/robin-icon';

const loginSchema = z.object({
  email: z.string().email('Invalid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

const signupSchema = z.object({
    name: z.string().min(2, 'Name is required.'),
    email: z.string().email('Invalid email address.'),
    password: z.string().min(6, 'Password must be at least 6 characters.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

export default function LoginPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onLoginSubmit = async (data: LoginFormValues) => {
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({ title: 'Login Successful', description: "Welcome back!" });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: error.message || 'An unknown error occurred.',
      });
    }
  };
  
  const onSignupSubmit = async (data: SignupFormValues) => {
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


  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
            <div className="text-center mb-6">
                <RobinIcon className="h-16 w-16 text-primary mx-auto mb-4" />
                <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Welcome to LocalDink</h1>
                <p className="text-muted-foreground mt-2">Sign in or create an account to start scheduling.</p>
            </div>

            <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Log In</TabsTrigger>
                    <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
                
                <TabsContent value="login">
                    <Card>
                        <CardHeader>
                            <CardTitle>Log In</CardTitle>
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
                                                <FormControl><Input type="password" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting}>
                                        {loginForm.formState.isSubmitting ? 'Logging In...' : 'Log In'}
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
            </Tabs>
        </div>
    </div>
  );
}
