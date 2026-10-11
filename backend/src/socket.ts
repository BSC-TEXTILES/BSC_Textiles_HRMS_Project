import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function setSocketIO(io: Server): void {
  ioInstance = io;
}

export function getSocketIO(): Server | null {
  return ioInstance;
}

export interface SocketEmitter {
  to(room: string): { emit(event: string, ...args: any[]): boolean };
  emit(event: string, ...args: any[]): boolean;
}

export const socketIO: SocketEmitter = {
  to(room: string) {
    if (ioInstance) {
      return ioInstance.to(room);
    }
    return {
      emit: () => false,
    };
  },
  emit(...args: any[]) {
    if (ioInstance) {
      return (ioInstance.emit as any)(...args);
    }
    return false;
  },
};

export default socketIO;
