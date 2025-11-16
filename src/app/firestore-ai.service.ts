import { Injectable } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, onSnapshot, Firestore, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FirestoreAIService {
  private firestore: Firestore;
  private readonly collectionName = 'public';
  private readonly promptField = 'prompt';
  private readonly responseField = 'response';

  constructor() {
    // Initialize Firebase if not already initialized
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    this.firestore = getFirestore(app);
  }

  async getAIResponse(userMessage: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        console.log('📤 Sending prompt to Firestore collection:', this.collectionName);
        console.log('📝 Prompt:', userMessage);
        
        // Add document with prompt and createTime (required by Firebase Extension)
        addDoc(collection(this.firestore, this.collectionName), {
          [this.promptField]: userMessage,
          createTime: serverTimestamp()
        }).then((docRef) => {
          console.log('✅ Document created with ID:', docRef.id);
          console.log('👂 Listening for response...');
          
          let hasResolved = false;
          
          // Listen for the response
          const unsubscribe = onSnapshot(
            doc(this.firestore, this.collectionName, docRef.id),
            (snapshot) => {
              if (!snapshot.exists()) {
                console.log('⚠️ Document does not exist yet');
                return;
              }
              
              const data = snapshot.data();
              console.log('📊 Document data update:', data);
              
              // Check for status field updates
              if (data && data['status']) {
                console.log('📈 Status:', data['status']);
                
                // Check if status indicates an error
                if (typeof data['status'] === 'string' && data['status'].toLowerCase().includes('error')) {
                  if (!hasResolved) {
                    hasResolved = true;
                    unsubscribe();
                    const errorMsg = data['error'] || data['status'] || 'Unknown error occurred';
                    reject(new Error(`AI Error: ${errorMsg}`));
                  }
                  return;
                }
              }
              
              // Also check for error field directly
              if (data && data['error']) {
                if (!hasResolved) {
                  hasResolved = true;
                  unsubscribe();
                  reject(new Error(`AI Error: ${data['error']}`));
                }
                return;
              }
              
              // Check if response field exists and has a value
              if (data && data[this.responseField]) {
                const response = data[this.responseField];
                console.log('✅ AI Response received:', response);
                
                if (!hasResolved) {
                  hasResolved = true;
                  unsubscribe();
                  resolve(response);
                }
                return;
              }
              
              // Log what fields we're seeing
              if (data) {
                console.log('📋 Available fields:', Object.keys(data));
                console.log('🔍 Looking for field:', this.responseField);
              }
            },
            (error) => {
              console.error('❌ Error listening to document:', error);
              if (!hasResolved) {
                hasResolved = true;
                unsubscribe();
                reject(error);
              }
            }
          );

          // Timeout after 30 seconds
          setTimeout(() => {
            if (!hasResolved) {
              hasResolved = true;
              console.error('⏱️ Timeout: AI response took too long (30s)');
              unsubscribe();
              reject(new Error('Timeout: AI response took too long. Check if the Firestore extension is running.'));
            }
          }, 30000);
        }).catch((error) => {
          console.error('❌ Error adding document to Firestore:', error);
          console.error('Error details:', {
            code: error.code,
            message: error.message,
            collection: this.collectionName
          });
          reject(new Error(`Failed to write to Firestore: ${error.message}`));
        });
      } catch (error) {
        console.error('❌ Error in getAIResponse:', error);
        reject(error);
      }
    });
  }
}

