'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Star, Home, Plus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { Court } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';
import { AddCourtSheet } from '@/components/add-court-sheet';

export default function CourtsPage() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const firestore = useFirestore();
  const courtsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'courts')) : null),
    [firestore]
  );
  const { data: courts, isLoading } = useCollection<Court>(courtsQuery);

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center">
        <Button onClick={() => setIsSheetOpen(true)}>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          Add Court
        </Button>
      </div>

      <AddCourtSheet open={isSheetOpen} onOpenChange={setIsSheetOpen} />

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
          <Card key={court.id}>
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
            <CardContent className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{court.location}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
