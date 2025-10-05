'use client';

import { courts } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Star, Home, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


export default function CourtsPage() {
  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Courts</h2>
        <Button>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          Add Court
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {courts.map((court) => (
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
