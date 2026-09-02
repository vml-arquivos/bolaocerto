import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth-shell';
export const metadata: Metadata = { title: 'Criar conta' };
export default function RegisterPage(){ return <AuthShell mode="register"/>; }
