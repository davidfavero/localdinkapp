'use client';

import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, doc } from 'firebase/firestore';
import type { Group, Player } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';
import { useEffect, useState } from 'react';

const GroupMemberAvatar = ({ groupId, memberId }: { groupId: string, memberId: string }) => {
  // This is a simplified example. In a real app, you might fetch member details
  // more efficiently, perhaps with a dedicated hook that batches reads.
  // For now, we'll just show a placeholder.
  // This component would need to fetch the user document from /users/{memberId}
  // For the purpose of this example, we'll just show a generic avatar.
  return (
     <Avatar className="h-8 w-8 border-2 border-background">
        <AvatarFallback>{memberId.charAt(0)}</AvatarFallback>
      </Avatar>
  )
}


export default function GroupsPage() {
  const firestore = useFirestore();
  
  const groupsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'groups')) : null),
    [firestore]
  );
  const { data: groups, isLoading } = useCollection<Group>(groupsQuery);


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Your Groups</h2>
        <Button>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          Add Group
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading && Array.from({length: 3}).map((_, i) => (
             <Card key={i} className="p-4 flex flex-col">
                 <CardContent className="flex items-center gap-4 p-0">
                    <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
                    <div className='space-y-2'>
                        <div className="h-4 w-24 rounded-md bg-muted animate-pulse" />
                        <div className="h-3 w-16 rounded-md bg-muted animate-pulse" />
                    </div>
                 </CardContent>
                 <div className="flex items-center -space-x-2 mt-4">
                    <div className="h-8 w-8 rounded-full bg-muted animate-pulse border-2 border-card" />
                    <div className="h-8 w-8 rounded-full bg-muted animate-pulse border-2 border-card" />
                    <div className="h-8 w-8 rounded-full bg-muted animate-pulse border-2 border-card" />
                 </div>
             </Card>
        ))}
        {groups?.map((group) => (
          <Card key={group.id} className="p-4 flex flex-col">
            <CardContent className="flex items-center gap-4 p-0">
              <Avatar className="h-12 w-12">
                <AvatarImage src={group.avatarUrl} alt={group.name} />
                <AvatarFallback>{group.name.charAt(0)}</AvatarFallback>
              </Avatar>

              <div>
                <p className="font-semibold">{group.name}</p>
                {/* In a real app, you'd get member count from a subcollection query */}
                {/* <p className="text-sm text-muted-foreground">{group.members?.length || 0} members</p> */}
              </div>
            </CardContent>
            {/* 
            This is a placeholder for member avatars.
            Fetching all member documents for each group on this page can be inefficient.
            A better approach would be to store member avatars directly on the group document
            or use a more optimized query strategy.
            */}
            {/* <div className="flex items-center -space-x-2 mt-4">
                <TooltipProvider>
                    {group.members?.map((memberId) => (
                        <Tooltip key={memberId}>
                            <TooltipTrigger>
                                <GroupMemberAvatar groupId={group.id} memberId={memberId} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Member</p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </TooltipProvider>
            </div> */}
          </Card>
        ))}
      </div>
    </div>
  );
}
