'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { UserAvatar } from '@/components/user-avatar';
import { useUser } from '@/firebase/provider';
import {
  Users, UserCheck, Calendar, MessageCircle, MapPin, UsersRound, Bell,
  TrendingUp, Activity, BarChart3, Trash2,
} from 'lucide-react';

interface AnalyticsData {
  counts: {
    users: number;
    players: number;
    sessions: number;
    conversations: number;
    courts: number;
    groups: number;
    notifications: number;
  };
  recentSessions: {
    id: string;
    courtName: string;
    courtLocation: string;
    organizerName: string;
    startTime: string | null;
    playerCount: number;
    isDoubles: boolean;
    status: string;
  }[];
  sessionsByDay: Record<string, number>;
  users: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    avatarUrl: string;
    createdAt: string | null;
  }[];
}

function getAllowedEmails(): string[] {
  const fromEnv = (process.env.NEXT_PUBLIC_ADMIN_DEBUG_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : ['davidfavero@gmail.com', 'david@localdink.com', 'mdfavero@gmail.com'];
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniBarChart({ data }: { data: Record<string, number> }) {
  const sortedDays = Object.keys(data).sort();
  if (sortedDays.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No sessions in the last 30 days.</p>;
  }

  const maxVal = Math.max(...Object.values(data), 1);

  // Fill in missing days
  const filled: { date: string; count: number }[] = [];
  const start = new Date(sortedDays[0]);
  const end = new Date();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    filled.push({ date: key, count: data[key] || 0 });
  }

  // Show last 30 days max
  const recent = filled.slice(-30);

  return (
    <div className="flex items-end gap-[2px] h-24 mt-2">
      {recent.map(({ date, count }) => (
        <div
          key={date}
          className="flex-1 bg-primary/80 rounded-t-sm hover:bg-primary transition-colors cursor-default group relative"
          style={{ height: `${Math.max((count / maxVal) * 100, count > 0 ? 8 : 2)}%` }}
          title={`${date}: ${count} session${count !== 1 ? 's' : ''}`}
        />
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { user, profile } = useUser();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  const isAdmin = getAllowedEmails().includes(
    (profile?.email || user?.email || '').toLowerCase()
  );

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    // Wait for profile to load (phone auth users have email in profile, not auth token)
    if (!profile && !user.email) return;
    
    const email = (profile?.email || user?.email || '').toLowerCase();
    if (!getAllowedEmails().includes(email)) {
      setIsLoading(false);
      return;
    }

    fetch('/api/admin/analytics', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [user, profile]);

  const toggleUser = (uid: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    // Exclude current user from select-all
    const selectable = data.users.filter((u) => u.id !== user?.uid);
    if (selectedUsers.size === selectable.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(selectable.map((u) => u.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedUsers.size === 0) return;
    const names = data?.users
      .filter((u) => selectedUsers.has(u.id))
      .map((u) => `${u.firstName} ${u.lastName}`.trim() || u.id);
    if (!confirm(`Delete ${selectedUsers.size} user(s)?\n\n${names?.join('\n')}\n\nThis will also delete their owned data (players, groups, courts, sessions, notifications) and their Firebase Auth account. This cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    setDeleteResult(null);
    try {
      const res = await fetch('/api/admin/delete-users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selectedUsers) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      const succeeded = body.results.filter((r: any) => r.deleted).length;
      const failed = body.results.filter((r: any) => !r.deleted).length;
      setDeleteResult(`Deleted ${succeeded} user(s)${failed > 0 ? `, ${failed} failed` : ''}`);

      // Remove deleted users from local data
      if (data) {
        const deletedIds = new Set(body.results.filter((r: any) => r.deleted).map((r: any) => r.uid));
        setData({
          ...data,
          users: data.users.filter((u) => !deletedIds.has(u.id)),
          counts: { ...data.counts, users: data.counts.users - succeeded },
        });
      }
      setSelectedUsers(new Set());
    } catch (err: any) {
      setDeleteResult(`Error: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <p className="text-muted-foreground">This page is restricted to administrators.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <Card className="border-destructive">
          <CardContent className="p-6 text-center text-destructive">
            <p className="font-medium">Failed to load analytics</p>
            <p className="text-sm mt-1">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">LocalDink platform overview</p>
        </div>
        <Badge variant="outline" className="text-xs">
          <Activity className="h-3 w-3 mr-1" />
          Live
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Registered Users" value={data.counts.users} color="bg-blue-500" />
        <StatCard icon={UserCheck} label="Player Contacts" value={data.counts.players} color="bg-green-500" />
        <StatCard icon={Calendar} label="Game Sessions" value={data.counts.sessions} color="bg-orange-500" />
        <StatCard icon={MessageCircle} label="Conversations" value={data.counts.conversations} color="bg-purple-500" />
        <StatCard icon={MapPin} label="Courts" value={data.counts.courts} color="bg-red-500" />
        <StatCard icon={UsersRound} label="Groups" value={data.counts.groups} color="bg-teal-500" />
        <StatCard icon={Bell} label="Notifications" value={data.counts.notifications} color="bg-yellow-500" />
        <StatCard icon={TrendingUp} label="Sessions / User" value={
          data.counts.users > 0 ? (data.counts.sessions / data.counts.users).toFixed(1) : '0'
        } color="bg-indigo-500" />
      </div>

      {/* Sessions Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Session Activity (Last 30 Days)
          </CardTitle>
          <CardDescription>
            {Object.values(data.sessionsByDay).reduce((a, b) => a + b, 0)} total sessions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MiniBarChart data={data.sessionsByDay} />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            {Object.keys(data.sessionsByDay).length > 0 && (
              <>
                <span>{Object.keys(data.sessionsByDay).sort()[0]}</span>
                <span>Today</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User Directory */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Users ({data.users.length})
              </CardTitle>
              <CardDescription>Registered accounts on LocalDink</CardDescription>
            </div>
            {selectedUsers.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {isDeleting ? 'Deleting...' : `Delete ${selectedUsers.size}`}
              </Button>
            )}
          </div>
          {deleteResult && (
            <p className={`text-sm mt-2 ${deleteResult.startsWith('Error') ? 'text-destructive' : 'text-green-600'}`}>
              {deleteResult}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 pb-3 border-b mb-1">
            <Checkbox
              checked={data.users.filter((u) => u.id !== user?.uid).length > 0 && selectedUsers.size === data.users.filter((u) => u.id !== user?.uid).length}
              onCheckedChange={toggleAll}
            />
            <span className="text-xs text-muted-foreground">Select all</span>
          </div>
          <div className="divide-y">
            {data.users.map((u) => {
              const isCurrentUser = u.id === user?.uid;
              return (
                <div key={u.id} className={`flex items-center gap-3 py-3 ${selectedUsers.has(u.id) ? 'bg-red-50 dark:bg-red-950/20 -mx-4 px-4 rounded' : ''}`}>
                  <Checkbox
                    checked={selectedUsers.has(u.id)}
                    onCheckedChange={() => toggleUser(u.id)}
                    disabled={isCurrentUser}
                  />
                  <UserAvatar
                    player={{ id: u.id, firstName: u.firstName, lastName: u.lastName, avatarUrl: u.avatarUrl, email: u.email } as any}
                    className="h-10 w-10"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {u.firstName} {u.lastName}
                      {!u.firstName && !u.lastName && <span className="text-muted-foreground italic">No name</span>}
                      {isCurrentUser && <Badge variant="outline" className="ml-2 text-[10px]">You</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[u.email, u.phone].filter(Boolean).join(' · ') || u.id}
                    </p>
                  </div>
                  {u.createdAt && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      Joined {new Date(u.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Recent Sessions
          </CardTitle>
          <CardDescription>Last 20 game sessions across all users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {data.recentSessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.courtName}
                    {s.courtLocation && <span className="text-muted-foreground font-normal"> · {s.courtLocation}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Organized by {s.organizerName} · {s.playerCount} player{s.playerCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px]">
                    {s.isDoubles ? 'Doubles' : 'Singles'}
                  </Badge>
                  {s.startTime && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(s.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {data.recentSessions.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No sessions yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
