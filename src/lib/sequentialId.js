import { runTransaction, doc } from 'firebase/firestore';
import { db } from './firebase';

export async function getNextBookId() {
  const counterRef = doc(db, 'metadata', 'counters');
  
  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let newId = 1;
    
    if (counterDoc.exists()) {
      newId = (counterDoc.data().lastBookId || 0) + 1;
      transaction.update(counterRef, { lastBookId: newId });
    } else {
      transaction.set(counterRef, { lastBookId: newId });
    }
    
    return String(newId);
  });
}
