import { redirect } from 'next/navigation';

export default function AttendanceMusterRedirect() {
  redirect('/attendance/register');
}
