'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MessagesRedirect() {
  const router = useRouter();
  useEffect(() => {
    // This page is currently a placeholder. 
    // For now, redirect to the main AI chat with Robin.
    // In the future, this will house player-to-player and group messaging.
    router.replace('/dashboard');
  }, [router]);

  return null;
}
