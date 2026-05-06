'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { LogIn, Delete } from 'lucide-react';
import { useAuth } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { useToast } from '@/hooks/use-toast';

const ADMIN_PASSWORD = '211288'; // Simple hardcoded password

export function KeypadLoginDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const auth = useAuth();
  const { toast } = useToast();

  const handleKeyPress = (key: string) => {
    if (password.length < 6) {
      setPassword(password + key);
    }
  };

  const handleDelete = () => {
    setPassword(password.slice(0, -1));
  };

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      try {
        window.localStorage.setItem('shaka:isAdmin', '1');
        window.dispatchEvent(new Event('shaka-admin-changed'));
      } catch {
        // ignore
      }
      initiateAnonymousSignIn(auth);
      toast({
        title: 'Connexion réussie',
        description: 'Bienvenue, Administrateur.',
      });
      setPassword('');
      setIsOpen(false);
    } else {
      toast({
        variant: 'destructive',
        title: 'Mot de passe incorrect',
        description: 'Veuillez réessayer.',
      });
      setPassword('');
    }
  };

  const keypadButtons = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    '', '0', ''
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <LogIn className="mr-2 h-4 w-4" />
          Connexion Admin
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-center">Accès Administrateur</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <Input
            type="password"
            value={password}
            readOnly
            className="h-12 w-48 text-center text-2xl tracking-[0.5em]"
            placeholder="******"
            maxLength={6}
          />
          <div className="grid grid-cols-3 gap-2">
            {keypadButtons.map((key, index) =>
              key ? (
                <Button
                  key={index}
                  variant="outline"
                  className="h-16 w-16 text-2xl font-bold"
                  onClick={() => handleKeyPress(key)}
                >
                  {key}
                </Button>
              ) : (
                <div key={index} />
              )
            )}
            <Button
                variant="outline"
                className="col-start-3 h-16 w-16 text-2xl font-bold"
                onClick={handleDelete}
            >
                <Delete />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => setPassword('')}>
              Annuler
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleLogin}>
            Entrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
