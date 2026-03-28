'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ConversationList } from '@/components/conversation-list';
import { ConversationDetail } from '@/components/conversation-detail';
import { NewConversationSheet } from '@/components/new-conversation-sheet';

function MessagesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId = searchParams.get('conversation');
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);

  if (conversationId) {
    return (
      <ConversationDetail
        conversationId={conversationId}
        onBack={() => router.push('/dashboard/messages')}
      />
    );
  }

  return (
    <>
      <ConversationList
        onSelectConversation={(id) => router.push(`/dashboard/messages?conversation=${id}`)}
        onNewConversation={() => setIsNewConversationOpen(true)}
      />
      <NewConversationSheet
        open={isNewConversationOpen}
        onOpenChange={setIsNewConversationOpen}
        onConversationCreated={(id) => {
          setIsNewConversationOpen(false);
          router.push(`/dashboard/messages?conversation=${id}`);
        }}
      />
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesContent />
    </Suspense>
  );
}
