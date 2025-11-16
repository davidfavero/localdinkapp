'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Star, Home, Plus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCollection, useFirestore, useFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Court } from '@/lib/types';
import { AddCourtSheet } from '@/components/add-court-sheet';
import { EditCourtSheet } from '@/components/edit-court-sheet';

export default function CourtsPage() {
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState<(Court & { id: string }) | null>(null);
  const firestore = useFirestore();
  const { user: authUser } = useFirebase();

  // Fetch courts owned by the current user
  const courtsQuery = useMemo(() => {
    if (!firestore || !authUser?.uid) {
      return null;
    }
    const q = query(collection(firestore, 'courts'), where('ownerId', '==', authUser.uid));
    (q as any).__memo = true;
    return q;
  }, [firestore, authUser?.uid]);

  const { data: courts, isLoading } = useCollection<Court>(courtsQuery);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold font-headline">Courts</h2>
        <Button onClick={() => setIsAddSheetOpen(true)}>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          Add Court
        </Button>
      </div>

      <AddCourtSheet open={isAddSheetOpen} onOpenChange={setIsAddSheetOpen} />
      <EditCourtSheet 
        court={selectedCourt} 
        open={!!selectedCourt} 
        onOpenChange={(open) => !open && setSelectedCourt(null)} 
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 w-3/4 rounded-md bg-muted animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-1/2 rounded-md bg-muted animate-pulse" />
              </CardContent>
            </Card>
          ))}
        {courts?.map((court) => (
          <Card 
            key={court.id}
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setSelectedCourt(court)}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{court.name}</span>
                <div className="flex items-center gap-2">
                  {court.isHome && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Home className="h-5 w-5 text-primary" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Home Court</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {court.isFavorite && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Star className="h-5 w-5 text-accent fill-accent" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Favorite</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span>{court.location}</span>
              </div>
              {court.address && (
                <div className="text-sm">
                  <p>{court.address}</p>
                  {(court.city || court.state || court.zipCode) && (
                    <p>
                      {court.city}{court.city && (court.state || court.zipCode) ? ', ' : ''}
                      {court.state} {court.zipCode}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!isLoading && courts?.length === 0 && (
          <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg">
            <MapPin className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="text-xl font-medium text-muted-foreground mt-4">No Courts Yet</h3>
            <p className="text-muted-foreground mt-2">Add your favorite pickleball courts to keep track of where you play.</p>
            <Button onClick={() => setIsAddSheetOpen(true)} className="mt-4">
              <Plus className="-ml-1 mr-2 h-4 w-4" />
              Add Court
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
