'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/user-avatar';
import { useUser } from '@/firebase/provider';
import {
  Users, UserCheck, Calendar, MessageCircle, MapPin, UsersRound, Bell,
  TrendingUp, Activity, BarChart3,
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

  const isAdmin = getAllowedEmails().includes(
    (profile?.email || user?.email || '').toLowerCase()
  );

  useEffect(() => {
    if (!user || !isAdmin) {
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
  }, [user, isAdmin]);

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
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users ({data.users.length})
          </CardTitle>
          <CardDescription>Registered accounts on LocalDink</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {data.users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-3">
                <UserAvatar
                  player={{ id: u.id, firstName: u.firstName, lastName: u.lastName, avatarUrl: u.avatarUrl, email: u.email } as any}
                  className="h-10 w-10"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {u.firstName} {u.lastName}
                    {!u.firstName && !u.lastName && <span className="text-muted-foreground italic">No name</span>}
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
            ))}
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
