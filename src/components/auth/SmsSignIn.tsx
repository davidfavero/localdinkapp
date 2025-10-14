'use client';

import { useState, useRef, useEffect } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '@/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SmsSignIn() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (recaptchaContainerRef.current) {
      const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
        size: 'invisible',
      });
      // @ts-ignore
      window.recaptchaVerifier = recaptchaVerifier;
    }
  }, []);

  const handleSendCode = async () => {
    if (!phoneNumber) {
      setError('Please enter a phone number.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      // @ts-ignore
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier);
      setConfirmationResult(confirmation);
    } catch (err: any) {
      setError(`Error sending verification code: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!confirmationResult) {
      setError('Please request a verification code first.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await confirmationResult.confirm(verificationCode);
      // The user is now signed in.
    } catch (err: any) {
      setError(`Error verifying code: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Sign In with SMS</h1>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        {!confirmationResult ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 555-555-5555"
              />
            </div>
            <Button onClick={handleSendCode} disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Sending...' : 'Send Verification Code'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Enter 6-digit code"
              />
            </div>
            <Button onClick={handleVerifyCode} disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Verifying...' : 'Verify Code'}
            </Button>
          </div>
        )}
        <div ref={recaptchaContainerRef} className="mt-4"></div>
      </div>
    </div>
  );
}
