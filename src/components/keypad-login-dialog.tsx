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
import { useToast } from '@/hooks/use-toast';


export function KeypadLoginDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleKeyPress = (key: string) => {
    if (password.length < 6) {
      setPassword(password + key);
    }
  };

  const handleDelete = () => {
    setPassword(password.slice(0, -1));
  };

  const handleLogin = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch('/api/admin/session', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:password})});
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Connexion impossible');
      window.localStorage.setItem('shaka:isAdmin', '1');
      window.dispatchEvent(new Event('shaka-admin-changed'));
      toast({title:'Connexion réussie',description:'Bienvenue, Administrateur.'});
      setPassword('');
      setIsOpen(false);
    } catch (error) {
      toast({variant:'destructive',title:'Connexion impossible',description:error instanceof Error ? error.message : 'Réessayez.'});
      setPassword('');
    } finally { setLoading(false); }
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
          <Button type="button" onClick={handleLogin} disabled={loading}>
            Entrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
