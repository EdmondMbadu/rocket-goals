import { Injectable } from '@angular/core';
import { firebaseConfig } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FirestoreAIService {
  private firestore: any = null;
  private firebaseInitialized = false;
  private readonly collectionName = 'public';
  private readonly promptField = 'prompt';
  private readonly responseField = 'response';

  private async initializeFirebase(): Promise<any> {
    if (!this.firebaseInitialized) {
      // Dynamically import Firebase only when needed
      const { getApp, getApps, initializeApp } = await import('firebase/app');
      const { getFirestore } = await import('firebase/firestore');
      
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      this.firestore = getFirestore(app);
      this.firebaseInitialized = true;
    }
    return this.firestore;
  }

  async getAIResponse(userMessage: string, onStreamChunk?: (chunk: string) => void): Promise<string> {
    const totalStartTime = performance.now();
    
    // Lazy load Firebase modules
    const firestore = await this.initializeFirebase();
    const { collection, addDoc, doc, onSnapshot } = await import('firebase/firestore');
    
    return new Promise((resolve, reject) => {
      try {
        console.log('📤 Sending prompt to Firestore collection:', this.collectionName);
        console.log('📝 Prompt:', userMessage);
        
        const writeStartTime = performance.now();
        let lastResponseText = '';
        let firstChunkReceived = false;
        
        // Add document with prompt (custom Cloud Function doesn't need createTime)
        addDoc(collection(firestore, this.collectionName), {
          [this.promptField]: userMessage
        }).then((docRef) => {
          const writeTime = performance.now() - writeStartTime;
          console.log(`✅ Document created in ${writeTime.toFixed(0)}ms with ID:`, docRef.id);
          console.log('👂 Listening for streaming response...');
          
          let firstUpdateTime: number | null = null;
          let processingStartTime: number | null = null;
          let responseReceivedTime: number | null = null;
          
          let hasResolved = false;
          let errorFirstSeen: number | null = null;
          const ERROR_RETRY_WAIT_TIME = 8000; // Wait 8 seconds for retry before rejecting
          
          // Listen for the response
          const unsubscribe = onSnapshot(
            doc(firestore, this.collectionName, docRef.id),
            (snapshot) => {
              if (!snapshot.exists()) {
                console.log('⚠️ Document does not exist yet');
                return;
              }
              
              const data = snapshot.data();
              const updateTime = performance.now();
              
              // Track timing
              if (firstUpdateTime === null) {
                firstUpdateTime = updateTime;
                const timeToFirstUpdate = firstUpdateTime - totalStartTime;
                console.log(`⏱️ First update received in ${timeToFirstUpdate.toFixed(0)}ms`);
              }
              
              // Check for status field updates
              if (data && data['status']) {
                const status = data['status'];
                
                // Handle status object (from Firebase Extension)
                let statusState: string | null = null;
                let statusError: string | null = null;
                
                if (typeof status === 'object' && status !== null) {
                  statusState = status.state || status.status || null;
                  statusError = status.error || null;
                } else if (typeof status === 'string') {
                  statusState = status;
                }
                
                // Check if status indicates an error
                if (statusState && statusState.toLowerCase() === 'error') {
                  // Track when we first see the error
                  if (errorFirstSeen === null) {
                    errorFirstSeen = Date.now();
                    console.log('⚠️ Error detected, waiting for retry...');
                  }
                  
                  // Check if error has persisted too long
                  const errorAge = Date.now() - errorFirstSeen;
                  if (errorAge > ERROR_RETRY_WAIT_TIME) {
                    // Error persisted too long, likely permanent
                    if (!hasResolved) {
                      hasResolved = true;
                      unsubscribe();
                      const errorMsg = statusError || data['error'] || statusState || 'Unknown error occurred';
                      reject(new Error(`AI Error (after retry wait): ${errorMsg}`));
                    }
                    return;
                  }
                  
                  // Error seen but within retry window - continue waiting
                  console.log(`⏳ Error seen ${errorAge}ms ago, waiting for retry (${ERROR_RETRY_WAIT_TIME - errorAge}ms remaining)...`);
                  return; // Don't reject yet, wait for retry
                } else if (statusState && statusState.toLowerCase() === 'complete') {
                  // Status changed to COMPLETE - retry succeeded!
                  if (errorFirstSeen !== null) {
                    console.log('✅ Retry succeeded! Status changed from ERROR to COMPLETE');
                    errorFirstSeen = null; // Reset error tracking
                  }
                } else if (statusState && (statusState.toLowerCase() === 'processing' || statusState.toLowerCase() === 'streaming')) {
                  // Status is PROCESSING or STREAMING - reset error tracking if it was in error
                  if (errorFirstSeen !== null) {
                    console.log('🔄 Status changed to PROCESSING/STREAMING - retry in progress');
                    errorFirstSeen = null; // Reset error tracking
                  }
                  
                  // Track when processing starts
                  if (processingStartTime === null) {
                    processingStartTime = updateTime;
                    const timeToProcessing = processingStartTime - totalStartTime;
                    console.log(`⏱️ Processing started in ${timeToProcessing.toFixed(0)}ms`);
                  }
                }
              }
              
              // Check for error field directly (but don't reject immediately)
              if (data && data['error'] && errorFirstSeen === null) {
                // Only track error if we haven't seen it before
                errorFirstSeen = Date.now();
                console.log('⚠️ Error field detected, waiting for retry...');
                // Don't return - continue to check for response
              }
              
              // Check if response field exists and has a value
              if (data && data[this.responseField]) {
                const response = data[this.responseField];
                
                // Handle streaming: emit new chunks as they arrive
                if (response.length > lastResponseText.length) {
                  const newChunk = response.substring(lastResponseText.length);
                  lastResponseText = response;
                  
                  // Emit chunk for immediate TTS
                  if (onStreamChunk && newChunk.trim().length > 0) {
                    // Check if we have enough text to start speaking (first sentence or 50 chars)
                    if (!firstChunkReceived) {
                      const firstSentenceEnd = Math.max(
                        response.indexOf('.'),
                        response.indexOf('!'),
                        response.indexOf('?')
                      );
                      
                      // Start speaking if we have a complete sentence or 20+ chars (reduced for instant response)
                      if (firstSentenceEnd > 0 || response.length >= 20) {
                        firstChunkReceived = true;
                        const timeToFirstChunk = updateTime - totalStartTime;
                        console.log(`⚡ First chunk ready for TTS in ${timeToFirstChunk.toFixed(0)}ms (${response.length} chars)`);
                        onStreamChunk(response); // Send full text so far for first TTS
                      }
                    } else {
                      // For subsequent chunks, send only the new text
                      onStreamChunk(newChunk);
                    }
                  }
                }
                
                if (responseReceivedTime === null) {
                  responseReceivedTime = updateTime;
                  const totalResponseTime = responseReceivedTime - totalStartTime;
                  const processingTime = processingStartTime ? responseReceivedTime - processingStartTime : null;
                  
                  console.log(`✅ AI Response chunk received in ${totalResponseTime.toFixed(0)}ms`);
                  if (processingTime !== null) {
                    console.log(`⏱️ Processing took ${processingTime.toFixed(0)}ms`);
                  }
                }
                
                // Resolve only when status is COMPLETE
                const status = data['status'];
                const statusState = typeof status === 'object' && status !== null 
                  ? (status.state || status.status) 
                  : status;
                
                if (statusState && statusState.toLowerCase() === 'complete' && !hasResolved) {
                  hasResolved = true;
                  unsubscribe();
                  console.log(`✅ Complete response received (${response.length} chars)`);
                  resolve(response);
                }
                return;
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

