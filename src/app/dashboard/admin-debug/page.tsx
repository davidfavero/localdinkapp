'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';

function getAllowedEmails(): string[] {
  const fromEnv = (process.env.NEXT_PUBLIC_ADMIN_DEBUG_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return ['davidfavero@gmail.com', 'david@localdink.com'];
}

export default function AdminDebugPage() {
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const email = (profile?.email || user?.email || '').toLowerCase();
  const isAllowed = getAllowedEmails().includes(email);

  const robinActionsQuery = useMemoFirebase(() => {
    if (!firestore || !user || !isAllowed) return null;
    return query(
      collection(firestore, 'robin-actions'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
  }, [firestore, user, isAllowed]);

  const smsLogsQuery = useMemoFirebase(() => {
    if (!firestore || !user || !isAllowed) return null;
    return query(
      collection(firestore, 'sms-attempt-logs'),
      where('organizerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
  }, [firestore, user, isAllowed]);

  const { data: robinActions, isLoading: robinActionsLoading } = useCollection<any>(robinActionsQuery);
  const { data: smsLogs, isLoading: smsLogsLoading } = useCollection<any>(smsLogsQuery);

  const robinRows = useMemo(() => robinActions || [], [robinActions]);
  const smsRows = useMemo(() => smsLogs || [], [smsLogs]);

  if (!isAllowed) {
    return <p className="text-sm text-muted-foreground">This page is restricted.</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Admin Debug - Last 20 Robin Actions</h2>
      {robinActionsLoading ? (
        <p className="text-sm text-muted-foreground">Loading Robin actions...</p>
      ) : robinRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Robin actions found yet.</p>
      ) : (
        robinRows.map((row) => (
          <Card key={row.id} className="p-3 space-y-1">
            <div className="text-xs text-muted-foreground">{row.createdAt || 'No timestamp'}</div>
            <div className="text-sm"><strong>Input:</strong> {row.inputMessage || '-'}</div>
            <div className="text-sm"><strong>Extracted:</strong> {(row.extractedPlayers || []).join(', ') || '-'}</div>
            <div className="text-sm"><strong>Date/Time/Court:</strong> {row.extractedDate || '-'} / {row.extractedTime || '-'} / {row.extractedLocation || '-'}</div>
            <div className="text-sm"><strong>Session:</strong> {row.createdSessionId || '-'}</div>
            <div className="text-sm"><strong>SMS:</strong> sent {row.notifiedCount || 0}, skipped {(row.skippedPlayers || []).length}</div>
          </Card>
        ))
      )}

      <h2 className="text-lg font-semibold pt-4">Last 20 SMS Attempts</h2>
      {smsLogsLoading ? (
        <p className="text-sm text-muted-foreground">Loading SMS logs...</p>
      ) : smsRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No SMS attempts found yet.</p>
      ) : (
        smsRows.map((row) => (
          <Card key={row.id} className="p-3 space-y-1">
            <div className="text-xs text-muted-foreground">{row.createdAt || 'No timestamp'}</div>
            <div className="text-sm"><strong>Session:</strong> {row.sessionId || '-'}</div>
            <div className="text-sm"><strong>Organizer:</strong> {row.organizerId || '-'}</div>
            <div className="text-sm"><strong>Notified:</strong> {row.notifiedCount || 0}</div>
            <div className="text-sm"><strong>Skipped:</strong> {(row.skippedPlayers || []).length}</div>
          </Card>
        ))
      )}
    </div>
  );
}
