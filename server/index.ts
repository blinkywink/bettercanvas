import express from 'express';
import cors from 'cors';
import fs from 'fs';
import http from 'http';
import os, { type NetworkInterfaceInfo } from 'os';
import path from 'path';
import ical from 'node-ical';
import multer from 'multer';
import {
  initPasswordAuth,
  registerAuthRoutes,
  passwordAuthApiGuard,
  isPasswordAuthEnabled,
  isAuthenticated,
  sendLoginPage,
} from './passwordGate';
import {
  isWebAuthEnabled,
  isWebAuthenticated,
  registerWebAuthRoutes,
  registerWebDataRoutes,
  sendWebLoginPage,
  webAuthApiGuard,
} from './webAuthDb';

// In CommonJS output, __dirname is available as a global
// TypeScript doesn't know about it, so we'll declare it
declare const __dirname: string;

// Get user data path from environment (set by Electron) or use default
const USER_DATA_PATH = process.env.USER_DATA_PATH || path.join(__dirname, '..', 'data');

try {
  fs.mkdirSync(USER_DATA_PATH, { recursive: true });
} catch (e) {
  console.error('Could not create data directory:', USER_DATA_PATH, e);
}

initPasswordAuth(USER_DATA_PATH);
const WEB_AUTH = isWebAuthEnabled();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

// Store connected SSE clients (by profile)
const sseClients = new Map<string, Set<express.Response>>();

if (WEB_AUTH || isPasswordAuthEnabled()) {
  app.use(cors({ origin: true, credentials: true }));
} else {
  app.use(cors());
}
app.use(express.json());
if (WEB_AUTH) {
  registerWebAuthRoutes(app);
  app.use(webAuthApiGuard);
  registerWebDataRoutes(app);
} else {
  registerAuthRoutes(app);
  app.use(passwordAuthApiGuard);
}

// Configure multer for file uploads
const uploadsDir = path.join(USER_DATA_PATH, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ 
  dest: uploadsDir,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/calendar' || file.originalname.endsWith('.ics')) {
      cb(null, true);
    } else {
      cb(new Error('Only .ics files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Parse course name from title
// Canvas format: "Assignment Title [+TRANSITIONS (ENGR_110_400_F2025)]"
// or "Assignment Title [+*DIFFERENTIAL CALCULUS (MTH_251Z_400_F2025)]"
// or "Assignment Title [COURSE NAME (COURSE_CODE_NUMBER_TERM)]"
function parseCourse(title: string, url?: string): string {
  // First, try to extract course from brackets at the end (Canvas format)
  // Pattern: [optional + or +*, then course name, then (COURSE_CODE_NUMBER_SECTION_TERM)]
  // This matches: [+...], [+*...], or just [...]
  // Section can be numeric (400) or alphanumeric (X401, Z401, etc.)
  const bracketMatch = title.match(/\[[+*]?(.*?)\s*\(([A-Z]+)_(\d+[A-Z]*)_[A-Z0-9]+_[A-Z0-9]+\)\]/);
  if (bracketMatch) {
    const coursePrefix = bracketMatch[2]; // e.g., "ENGR", "MTH", "ORG"
    const courseNumber = bracketMatch[3]; // e.g., "110", "252Z", "8445"
    
    // Filter out organizations (ORG_) - these are not courses
    if (coursePrefix === 'ORG') {
      return 'Other';
    }
    
    // Extract course code (e.g., "ENGR_110" -> "ENGR 110")
    const courseCode = coursePrefix + ' ' + courseNumber;
    return courseCode;
  }
  
  // Try to extract course from URL if available (Canvas URLs contain course IDs)
  if (url) {
    try {
      const urlObj = new URL(url);
      // Canvas assignment URLs: /courses/{courseId}/assignments/{assignmentId}
      const courseMatch = urlObj.pathname.match(/\/courses\/(\d+)\//);
      if (courseMatch) {
        // We have a course ID, but we can't get the course code from URL alone
        // So we'll still return 'Other' but this could be enhanced with a course lookup
      }
      // Canvas calendar URLs: include_contexts=course_{courseId}
      const contextMatch = urlObj.searchParams.get('include_contexts');
      if (contextMatch) {
        const courseContextMatch = contextMatch.match(/course_(\d+)/);
        if (courseContextMatch) {
          // Still can't get course code from URL, but we know it's a course
        }
      }
    } catch (e) {
      // Invalid URL, ignore
    }
  }
  
  // Fallback: Try to extract course code from beginning ONLY if it looks like a standard course code
  // Pattern: 2-6 uppercase letters, optional space, 3-4 digits, optional letter
  // This is more conservative - only matches if it's clearly a course code format
  const match = title.match(/^([A-Z]{2,6})\s*(\d{3,4}[A-Z]*)\s*[:]/);
  if (match) {
    // Only return if it looks like a real course code (not just any text)
    return match[1] + ' ' + match[2];
  }
  
  // Don't use the colon fallback - it's too aggressive and catches assignment titles
  // Return 'Other' for anything that doesn't match Canvas bracket format
  return 'Other';
}

// Clean title by removing the bracketed course information at the end
function cleanTitle(title: string): string {
  // Remove Canvas format brackets: [+... (COURSE_CODE_...)] or [+*... (COURSE_CODE_...)]
  // Match: [ followed by optional + or *, then any characters, then (COURSE_CODE_NUMBER_SECTION_TERM), then ]
  // Section can be numeric (400) or alphanumeric (X401, Z401, etc.)
  // This pattern matches brackets at the end of the title
  const pattern = /\s*\[[+*]?.*?\([A-Z]+_\d+[A-Z]*_[A-Z0-9]+_[A-Z0-9]+\)\]\s*$/;
  const cleaned = title.replace(pattern, '').trim();
  return cleaned || title; // Return original if nothing matched
}

// Convert Canvas calendar URL to direct assignment URL
function convertCalendarUrlToAssignmentUrl(calendarUrl: string): string | undefined {
  try {
    const url = new URL(calendarUrl);
    
    // Extract course ID from include_contexts parameter
    const contexts = url.searchParams.get('include_contexts');
    const courseMatch = contexts?.match(/course_(\d+)/);
    const courseId = courseMatch ? courseMatch[1] : null;
    
    // Extract assignment ID from hash fragment
    const hash = url.hash;
    const assignmentMatch = hash.match(/#assignment_(\d+)/);
    const assignmentId = assignmentMatch ? assignmentMatch[1] : null;
    
    // Construct assignment URL if we have both IDs
    if (courseId && assignmentId) {
      return `https://canvas.oregonstate.edu/courses/${courseId}/assignments/${assignmentId}`;
    }
    
    return undefined;
  } catch (error) {
    return undefined;
  }
}

interface CalendarEventResponse {
  uid: string;
  title: string;
  course: string;
  description: string;
  start: string;
  end?: string;
  location?: string;
  url?: string;
}

// Helper function to parse events from an ICS file
function parseEventsFromFile(icsPath: string): CalendarEventResponse[] {
  if (!fs.existsSync(icsPath)) {
    throw new Error('Calendar file not found');
  }

  const fileContent = fs.readFileSync(icsPath, 'utf-8');
  const events = ical.parseICS(fileContent);

  const calendarEvents: CalendarEventResponse[] = [];

  for (const key in events) {
    const event = events[key];
    
    if (event.type === 'VEVENT') {
      const start = event.start ? new Date(event.start) : null;
      const end = event.end ? new Date(event.end) : null;
      
      if (!start) continue;

      const rawTitle = event.summary || 'Untitled Event';
      const title = cleanTitle(rawTitle);
      const description = event.description || '';
      const location = event.location || '';
      // Extract URL - node-ical stores it as event.url.val
          let rawUrl: string | undefined;
          if (event.url) {
            if (typeof event.url === 'string') {
              rawUrl = event.url;
            } else if (typeof event.url === 'object' && event.url !== null && 'val' in event.url) {
              rawUrl = (event.url as any).val;
            }
          }
      
      // Convert calendar URL to assignment URL if it's a calendar link
      const url = rawUrl && rawUrl.includes('canvas.oregonstate.edu/calendar') && rawUrl.includes('#assignment_')
        ? convertCalendarUrlToAssignmentUrl(rawUrl)
        : rawUrl;
      
      calendarEvents.push({
        uid: event.uid || key,
        title,
        course: parseCourse(rawTitle, rawUrl), // Use raw title and URL for course parsing
        description,
        start: start.toISOString(),
        end: end ? end.toISOString() : undefined,
        location: location || undefined,
        url: url || undefined,
      });
    }
  }

  // Sort by start date
  calendarEvents.sort((a, b) => 
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  return calendarEvents;
}

app.get('/api/events', async (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const icsPath = profileId === 'default' 
      ? path.join(USER_DATA_PATH, 'calendar.ics')
      : path.join(USER_DATA_PATH, 'profiles', `${profileId}.ics`);
    
    // If file doesn't exist, return empty array instead of error
    if (!fs.existsSync(icsPath)) {
      return res.json([]);
    }
    
    const calendarEvents = parseEventsFromFile(icsPath);
    res.json(calendarEvents);
  } catch (error) {
    console.error('Error parsing calendar:', error);
    res.status(500).json({ error: 'Failed to parse calendar file' });
  }
});

// Helper function to get profile metadata file path
function getProfileMetadataPath(): string {
  return path.join(USER_DATA_PATH, 'profiles.json');
}

// Helper function to load profile metadata
function loadProfileMetadata(): Record<string, { name: string }> {
  const metadataPath = getProfileMetadataPath();
  if (fs.existsSync(metadataPath)) {
    try {
      return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    } catch (error) {
      return {};
    }
  }
  return {};
}

// Helper function to save profile metadata
function saveProfileMetadata(metadata: Record<string, { name: string }>): void {
  const metadataPath = getProfileMetadataPath();
  const dataDir = path.dirname(metadataPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

// Get list of profiles
app.get('/api/profiles', (req, res) => {
  try {
    const profilesDir = path.join(USER_DATA_PATH, 'profiles');
    const defaultPath = path.join(USER_DATA_PATH, 'calendar.ics');
    const metadata = loadProfileMetadata();
    
    const profiles: Array<{ id: string; name: string; createdAt: string }> = [];
    
    // Add default profile if it exists
    if (fs.existsSync(defaultPath)) {
      const stats = fs.statSync(defaultPath);
      profiles.push({
        id: 'default',
        name: metadata['default']?.name || 'Default',
        createdAt: stats.birthtime.toISOString(),
      });
    }
    
    // Add other profiles
    if (fs.existsSync(profilesDir)) {
      const files = fs.readdirSync(profilesDir);
      files.forEach((file) => {
        if (file.endsWith('.ics')) {
          const profileId = file.replace('.ics', '');
          const filePath = path.join(profilesDir, file);
          const stats = fs.statSync(filePath);
          profiles.push({
            id: profileId,
            name: metadata[profileId]?.name || profileId,
            createdAt: stats.birthtime.toISOString(),
          });
        }
      });
    }
    
    res.json(profiles);
  } catch (error) {
    console.error('Error listing profiles:', error);
    res.status(500).json({ error: 'Failed to list profiles' });
  }
});

// Upload new .ics file (creates or updates a profile)
app.post('/api/upload', upload.single('icsFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const profileId = req.body.profileId || `profile-${Date.now()}`;
    let profileName = req.body.profileName || profileId;
    // Enforce 16 character limit
    if (profileName.length > 16) {
      profileName = profileName.substring(0, 16);
    }
    const isUpdate = req.body.isUpdate === 'true';
    
    // Ensure profiles directory exists
    const profilesDir = path.join(USER_DATA_PATH, 'profiles');
    if (!fs.existsSync(profilesDir)) {
      fs.mkdirSync(profilesDir, { recursive: true });
    }
    
    // Determine destination
    const destPath = profileId === 'default'
      ? path.join(USER_DATA_PATH, 'calendar.ics')
      : path.join(profilesDir, `${profileId}.ics`);
    
    // Move uploaded file to destination
    fs.renameSync(req.file.path, destPath);
    
    // Validate the file by parsing it
    try {
      parseEventsFromFile(destPath);
    } catch (parseError) {
      // If parsing fails, delete the file
      fs.unlinkSync(destPath);
      return res.status(400).json({ error: 'Invalid ICS file format' });
    }
    
    // Save profile name in metadata
    const metadata = loadProfileMetadata();
    metadata[profileId] = { name: profileName };
    saveProfileMetadata(metadata);
    
    res.json({ 
      success: true, 
      profileId,
      profileName,
      isUpdate,
      message: isUpdate ? 'Profile updated successfully' : 'Profile created successfully'
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Rename a profile
app.put('/api/profiles/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;
    const { name } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Profile name is required' });
    }
    
    const trimmedName = name.trim();
    if (trimmedName.length > 16) {
      return res.status(400).json({ error: 'Profile name must be 16 characters or less' });
    }
    
    // Check if profile exists
    const profilesDir = path.join(USER_DATA_PATH, 'profiles');
    const defaultPath = path.join(USER_DATA_PATH, 'calendar.ics');
    const profilePath = profileId === 'default' 
      ? defaultPath
      : path.join(profilesDir, `${profileId}.ics`);
    
    if (!fs.existsSync(profilePath)) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Update metadata
    const metadata = loadProfileMetadata();
    metadata[profileId] = { name: trimmedName };
    saveProfileMetadata(metadata);
    
    res.json({ success: true, message: 'Profile renamed successfully' });
  } catch (error) {
    console.error('Error renaming profile:', error);
    res.status(500).json({ error: 'Failed to rename profile' });
  }
});

// Helper function to get custom events file path
function getCustomEventsPath(profileId: string): string {
  const customEventsFile = profileId === 'default'
    ? 'custom-events.json'
    : `custom-events-${profileId}.json`;
  return path.join(USER_DATA_PATH, customEventsFile);
}

// Delete a profile
app.delete('/api/profiles/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;
    
    if (profileId === 'default') {
      const defaultPath = path.join(USER_DATA_PATH, 'calendar.ics');
      if (fs.existsSync(defaultPath)) {
        fs.unlinkSync(defaultPath);
      }
    } else {
      const profilePath = path.join(USER_DATA_PATH, 'profiles', `${profileId}.ics`);
      if (fs.existsSync(profilePath)) {
        fs.unlinkSync(profilePath);
      }
    }
    
    // Delete custom events for this profile
    const customEventsPath = getCustomEventsPath(profileId);
    if (fs.existsSync(customEventsPath)) {
      fs.unlinkSync(customEventsPath);
    }
    
    // Remove from metadata
    const metadata = loadProfileMetadata();
    delete metadata[profileId];
    saveProfileMetadata(metadata);
    
    res.json({ success: true, message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// Get custom events for a profile
app.get('/api/custom-events', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const customEventsPath = getCustomEventsPath(profileId);
    
    if (!fs.existsSync(customEventsPath)) {
      return res.json([]);
    }
    
    let customEvents = JSON.parse(fs.readFileSync(customEventsPath, 'utf-8'));
    
    // Migrate old "My Events" to "My Tasks"
    let needsSave = false;
    customEvents = customEvents.map((event: any) => {
      if (event.course === 'My Events') {
        event.course = 'My Tasks';
        needsSave = true;
      }
      return event;
    });
    
    // Save if migration was needed
    if (needsSave) {
      fs.writeFileSync(customEventsPath, JSON.stringify(customEvents, null, 2));
    }
    
    res.json(customEvents);
  } catch (error) {
    console.error('Error loading custom events:', error);
    res.status(500).json({ error: 'Failed to load custom events' });
  }
});

// Create a custom event
app.post('/api/custom-events', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const { title, description, start, end, location } = req.body;
    
    if (!title || !start) {
      return res.status(400).json({ error: 'Title and start date are required' });
    }
    
    const customEventsPath = getCustomEventsPath(profileId);
    const dataDir = path.dirname(customEventsPath);
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load existing custom events
    let customEvents: any[] = [];
    if (fs.existsSync(customEventsPath)) {
      customEvents = JSON.parse(fs.readFileSync(customEventsPath, 'utf-8'));
    }
    
    // Create new event
    const newEvent = {
      uid: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      course: 'My Tasks',
      description: description || '',
      start: new Date(start).toISOString(),
      end: end ? new Date(end).toISOString() : undefined,
      location: location || undefined,
    };
    
    customEvents.push(newEvent);
    
    // Save custom events
    fs.writeFileSync(customEventsPath, JSON.stringify(customEvents, null, 2));
    
    // Broadcast change to all connected clients (excluding the source tab)
    const sourceTabId = req.headers['x-tab-id'] as string | undefined;
    broadcastStateChange(profileId, 'custom-event-created', newEvent, sourceTabId);
    
    res.json({ success: true, event: newEvent });
  } catch (error) {
    console.error('Error creating custom event:', error);
    res.status(500).json({ error: 'Failed to create custom event' });
  }
});

// Update a custom event
app.put('/api/custom-events/:uid', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const { uid } = req.params;
    const { start, end, title, description, location } = req.body;
    const customEventsPath = getCustomEventsPath(profileId);
    
    if (!fs.existsSync(customEventsPath)) {
      return res.status(404).json({ error: 'Custom events file not found' });
    }
    
    let customEvents = JSON.parse(fs.readFileSync(customEventsPath, 'utf-8'));
    const eventIndex = customEvents.findIndex((e: any) => e.uid === uid);
    
    if (eventIndex === -1) {
      return res.status(404).json({ error: 'Custom event not found' });
    }
    
    // Update the event
    if (start !== undefined) customEvents[eventIndex].start = new Date(start).toISOString();
    if (end !== undefined) customEvents[eventIndex].end = end ? new Date(end).toISOString() : undefined;
    if (title !== undefined) customEvents[eventIndex].title = title;
    if (description !== undefined) customEvents[eventIndex].description = description;
        if (location !== undefined) customEvents[eventIndex].location = location;

        fs.writeFileSync(customEventsPath, JSON.stringify(customEvents, null, 2));

        // Broadcast change to all connected clients (excluding the source tab)
        const sourceTabId = req.headers['x-tab-id'] as string | undefined;
        broadcastStateChange(profileId, 'custom-event-updated', customEvents[eventIndex], sourceTabId);

        res.json({ success: true, event: customEvents[eventIndex] });
  } catch (error) {
    console.error('Error updating custom event:', error);
    res.status(500).json({ error: 'Failed to update custom event' });
  }
});

// Delete a custom event
app.delete('/api/custom-events/:uid', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const { uid } = req.params;
    const customEventsPath = getCustomEventsPath(profileId);
    
    if (!fs.existsSync(customEventsPath)) {
      return res.status(404).json({ error: 'Custom events file not found' });
    }
    
        let customEvents = JSON.parse(fs.readFileSync(customEventsPath, 'utf-8'));
        customEvents = customEvents.filter((e: any) => e.uid !== uid);

        fs.writeFileSync(customEventsPath, JSON.stringify(customEvents, null, 2));

        // Broadcast change to all connected clients (excluding the source tab)
        const sourceTabId = req.headers['x-tab-id'] as string | undefined;
        broadcastStateChange(profileId, 'custom-event-deleted', { uid }, sourceTabId);

        res.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom event:', error);
    res.status(500).json({ error: 'Failed to delete custom event' });
  }
});

// Helper function to get user state file path (notes, completion, etc.)
function getUserStatePath(profileId: string, stateType: 'notes' | 'completed' | 'initialized' | 'course-colors' | 'course-visibility' | 'course-order' | 'theme' | 'profile'): string {
  const stateFile = profileId === 'default'
    ? `user-state-${stateType}.json`
    : `user-state-${profileId}-${stateType}.json`;
  return path.join(USER_DATA_PATH, stateFile);
}

// Helper function to broadcast state change to all connected clients for a profile
// sourceTabId: if provided, the tab that made the change will ignore the broadcast
function broadcastStateChange(profileId: string, stateType: string, data: any, sourceTabId?: string) {
  const clients = sseClients.get(profileId);
  if (clients) {
    const message = JSON.stringify({ type: stateType, data, sourceTabId });
    clients.forEach((client) => {
      try {
        client.write(`data: ${message}\n\n`);
      } catch (error) {
        // Client disconnected, remove it
        clients.delete(client);
      }
    });
  }
}

// SSE endpoint for real-time updates
app.get('/api/events-stream', (req, res) => {
  const profileId = req.query.profile as string || 'default';
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx
  
  // Add client to the set
  if (!sseClients.has(profileId)) {
    sseClients.set(profileId, new Set());
  }
  sseClients.get(profileId)!.add(res);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    const clients = sseClients.get(profileId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(profileId);
      }
    }
  });
});

// Get notes for a profile
app.get('/api/user-state/notes', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const notesPath = getUserStatePath(profileId, 'notes');
    
    if (!fs.existsSync(notesPath)) {
      return res.json({});
    }
    
    const notes = JSON.parse(fs.readFileSync(notesPath, 'utf-8'));
    res.json(notes);
  } catch (error) {
    console.error('Error loading notes:', error);
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

// Update notes for a profile
app.put('/api/user-state/notes', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    
    // The body should be the notes object directly
    let notes: Record<string, string>;
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      if ('notes' in req.body && typeof req.body.notes === 'object') {
        notes = req.body.notes;
      } else {
        notes = req.body as Record<string, string>;
      }
    } else {
      return res.status(400).json({ error: 'Invalid notes data' });
    }
    
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) {
      return res.status(400).json({ error: 'Invalid notes data structure' });
    }
    
    const notesPath = getUserStatePath(profileId, 'notes');
    const dataDir = path.dirname(notesPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
    
    // Broadcast change to all connected clients
    broadcastStateChange(profileId, 'notes', notes);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving notes:', error);
    res.status(500).json({ error: 'Failed to save notes' });
  }
});

// Get completion status for a profile
app.get('/api/user-state/completed', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const completedPath = getUserStatePath(profileId, 'completed');
    
    console.log(`Loading completion status for profile ${profileId} from ${completedPath}`);
    
    if (!fs.existsSync(completedPath)) {
      console.log('Completion status file does not exist, returning empty object');
      return res.json({});
    }
    
    const completed = JSON.parse(fs.readFileSync(completedPath, 'utf-8'));
    console.log(`Loaded completion status:`, completed);
    res.json(completed);
  } catch (error) {
    console.error('Error loading completion status:', error);
    res.status(500).json({ error: 'Failed to load completion status' });
  }
});

// Update completion status for a profile
app.put('/api/user-state/completed', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const sourceTabId = req.headers['x-tab-id'] as string | undefined;
    
    console.log('Received PUT /api/user-state/completed');
    console.log('Request body:', req.body);
    console.log('Request body type:', typeof req.body);
    console.log('Request headers:', req.headers['content-type']);
    console.log('Source tab ID:', sourceTabId);
    
    // The body should be the completed object directly (parsed by express.json())
    let completed: Record<string, boolean>;
    
    if (!req.body) {
      console.error('No request body received');
      return res.status(400).json({ error: 'No data received' });
    }
    
    if (typeof req.body === 'object' && !Array.isArray(req.body)) {
      // Check if it's wrapped in a 'completed' property
      if ('completed' in req.body && typeof req.body.completed === 'object') {
        completed = req.body.completed;
      } else {
        // Assume the body itself is the completed object
        completed = req.body as Record<string, boolean>;
      }
    } else {
      console.error('Invalid completion data received:', req.body, typeof req.body);
      return res.status(400).json({ error: 'Invalid completion data format' });
    }
    
    console.log(`Saving completion status for profile ${profileId}:`, completed);
    
    if (!completed || typeof completed !== 'object' || Array.isArray(completed)) {
      console.error('Invalid completion data structure:', completed);
      return res.status(400).json({ error: 'Invalid completion data structure' });
    }
    
    const completedPath = getUserStatePath(profileId, 'completed');
    const dataDir = path.dirname(completedPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
        fs.writeFileSync(completedPath, JSON.stringify(completed, null, 2));
        console.log(`Successfully saved completion status to ${completedPath}`);
        
        // Broadcast change to all connected clients (excluding the source tab)
        broadcastStateChange(profileId, 'completed', completed, sourceTabId);
        
        res.json({ success: true });
  } catch (error) {
    console.error('Error saving completion status:', error);
    res.status(500).json({ error: 'Failed to save completion status' });
  }
});

// Get initialized status for a profile
app.get('/api/user-state/initialized', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const initializedPath = getUserStatePath(profileId, 'initialized');
    
    if (!fs.existsSync(initializedPath)) {
      return res.json({ initialized: false });
    }
    
    const data = JSON.parse(fs.readFileSync(initializedPath, 'utf-8'));
    res.json(data);
  } catch (error) {
    console.error('Error loading initialized status:', error);
    res.json({ initialized: false });
  }
});

// Update initialized status for a profile
app.put('/api/user-state/initialized', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const { initialized } = req.body;
    
    const initializedPath = getUserStatePath(profileId, 'initialized');
    const dataDir = path.dirname(initializedPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(initializedPath, JSON.stringify({ initialized: initialized === true }, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving initialized status:', error);
    res.status(500).json({ error: 'Failed to save initialized status' });
  }
});

// Get course colors for a profile
app.get('/api/user-state/course-colors', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const colorsPath = getUserStatePath(profileId, 'course-colors');
    
    if (!fs.existsSync(colorsPath)) {
      return res.json({});
    }
    
    const colors = JSON.parse(fs.readFileSync(colorsPath, 'utf-8'));
    res.json(colors);
  } catch (error) {
    console.error('Error loading course colors:', error);
    res.status(500).json({ error: 'Failed to load course colors' });
  }
});

// Update course colors for a profile
app.put('/api/user-state/course-colors', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const sourceTabId = req.headers['x-tab-id'] as string | undefined;
    
    // The body should be the colors object directly
    let colors: Record<string, string>;
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      if ('colors' in req.body && typeof req.body.colors === 'object') {
        colors = req.body.colors;
      } else {
        colors = req.body as Record<string, string>;
      }
    } else {
      return res.status(400).json({ error: 'Invalid colors data' });
    }
    
    if (!colors || typeof colors !== 'object' || Array.isArray(colors)) {
      return res.status(400).json({ error: 'Invalid colors data structure' });
    }
    
    const colorsPath = getUserStatePath(profileId, 'course-colors');
    const dataDir = path.dirname(colorsPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(colorsPath, JSON.stringify(colors, null, 2));
    
    // Broadcast change to all connected clients (excluding the source tab)
    broadcastStateChange(profileId, 'course-colors', colors, sourceTabId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving course colors:', error);
    res.status(500).json({ error: 'Failed to save course colors' });
  }
});

// Get course visibility for a profile
app.get('/api/user-state/course-visibility', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const visibilityPath = getUserStatePath(profileId, 'course-visibility');
    
    if (!fs.existsSync(visibilityPath)) {
      return res.json({});
    }
    
    const visibility = JSON.parse(fs.readFileSync(visibilityPath, 'utf-8'));
    res.json(visibility);
  } catch (error) {
    console.error('Error loading course visibility:', error);
    res.status(500).json({ error: 'Failed to load course visibility' });
  }
});

// Update course visibility for a profile
app.put('/api/user-state/course-visibility', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const sourceTabId = req.headers['x-tab-id'] as string | undefined;
    
    // The body should be the visibility object directly
    let visibility: Record<string, boolean>;
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      if ('visibility' in req.body && typeof req.body.visibility === 'object') {
        visibility = req.body.visibility;
      } else {
        visibility = req.body as Record<string, boolean>;
      }
    } else {
      return res.status(400).json({ error: 'Invalid visibility data' });
    }
    
    if (!visibility || typeof visibility !== 'object' || Array.isArray(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility data structure' });
    }
    
    const visibilityPath = getUserStatePath(profileId, 'course-visibility');
    const dataDir = path.dirname(visibilityPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
        fs.writeFileSync(visibilityPath, JSON.stringify(visibility, null, 2));
        
        // Broadcast change to all connected clients (excluding the source tab)
        broadcastStateChange(profileId, 'course-visibility', visibility, sourceTabId);
        
        res.json({ success: true });
  } catch (error) {
    console.error('Error saving course visibility:', error);
    res.status(500).json({ error: 'Failed to save course visibility' });
  }
});

// Get course order for a profile
app.get('/api/user-state/course-order', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const orderPath = getUserStatePath(profileId, 'course-order');
    
    if (!fs.existsSync(orderPath)) {
      return res.json([]);
    }
    
    const order = JSON.parse(fs.readFileSync(orderPath, 'utf-8'));
    res.json(order);
  } catch (error) {
    console.error('Error loading course order:', error);
    res.status(500).json({ error: 'Failed to load course order' });
  }
});

// Update course order for a profile
app.put('/api/user-state/course-order', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const sourceTabId = req.headers['x-tab-id'] as string | undefined;
    
    // The body should be the order array directly
    let order: string[];
    if (req.body && Array.isArray(req.body)) {
      order = req.body;
    } else if (req.body && typeof req.body === 'object' && 'order' in req.body && Array.isArray(req.body.order)) {
      order = req.body.order;
    } else {
      return res.status(400).json({ error: 'Invalid order data' });
    }
    
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Invalid order data structure' });
    }
    
    const orderPath = getUserStatePath(profileId, 'course-order');
    const dataDir = path.dirname(orderPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(orderPath, JSON.stringify(order, null, 2));
    
    // Broadcast change to all connected clients (excluding the source tab)
    broadcastStateChange(profileId, 'course-order', order, sourceTabId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving course order:', error);
    res.status(500).json({ error: 'Failed to save course order' });
  }
});

// Get theme for a profile
app.get('/api/user-state/theme', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const themePath = getUserStatePath(profileId, 'theme');
    
    if (!fs.existsSync(themePath)) {
      return res.json({ themeName: null });
    }
    
    const theme = JSON.parse(fs.readFileSync(themePath, 'utf-8'));
    res.json(theme);
  } catch (error) {
    console.error('Error loading theme:', error);
    res.json({ themeName: null });
  }
});

// Update theme for a profile
app.put('/api/user-state/theme', (req, res) => {
  try {
    const profileId = req.query.profile as string || 'default';
    const sourceTabId = req.headers['x-tab-id'] as string | undefined;
    const { themeName } = req.body;
    
    if (typeof themeName !== 'string' && themeName !== null) {
      return res.status(400).json({ error: 'Invalid theme name' });
    }
    
    const themePath = getUserStatePath(profileId, 'theme');
    const dataDir = path.dirname(themePath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
        fs.writeFileSync(themePath, JSON.stringify({ themeName }, null, 2));
        
        // Broadcast change to all connected clients (excluding the source tab)
        broadcastStateChange(profileId, 'theme', { themeName }, sourceTabId);
        
        res.json({ success: true });
  } catch (error) {
    console.error('Error saving theme:', error);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

// Get current profile
app.get('/api/user-state/profile', (req, res) => {
  try {
    const profilePath = getUserStatePath('default', 'profile');
    
    if (!fs.existsSync(profilePath)) {
      return res.json({ profileId: 'default' });
    }
    
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    res.json(profile);
  } catch (error) {
    console.error('Error loading profile:', error);
    res.json({ profileId: 'default' });
  }
});

// Update current profile
app.put('/api/user-state/profile', (req, res) => {
  try {
    const { profileId } = req.body;
    
    if (typeof profileId !== 'string') {
      return res.status(400).json({ error: 'Invalid profile ID' });
    }
    
    const profilePath = getUserStatePath('default', 'profile');
    const dataDir = path.dirname(profilePath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(profilePath, JSON.stringify({ profileId }, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Helper function to get workout data file path
function getWorkoutDataPath(dataType: 'sets' | 'default-set' | 'days'): string {
  const fileName = `workout-${dataType}.json`;
  return path.join(USER_DATA_PATH, fileName);
}

// Get workout sets
app.get('/api/workout/sets', (req, res) => {
  try {
    const setsPath = getWorkoutDataPath('sets');
    if (!fs.existsSync(setsPath)) {
      return res.json({ sets: [] });
    }
    const data = JSON.parse(fs.readFileSync(setsPath, 'utf-8'));
    res.json(data);
  } catch (error) {
    console.error('Error loading workout sets:', error);
    res.status(500).json({ error: 'Failed to load workout sets' });
  }
});

// Update workout sets
app.put('/api/workout/sets', (req, res) => {
  try {
    const { sets } = req.body;
    if (!Array.isArray(sets)) {
      return res.status(400).json({ error: 'Invalid sets data' });
    }
    
    // Validate sets (3-5 exercises each)
    for (const set of sets) {
      if (!set.id || !set.name || !Array.isArray(set.exercises)) {
        return res.status(400).json({ error: 'Invalid set format' });
      }
      if (set.exercises.length < 3 || set.exercises.length > 5) {
        return res.status(400).json({ error: 'Each set must have 3-5 exercises' });
      }
    }
    
    const setsPath = getWorkoutDataPath('sets');
    const dataDir = path.dirname(setsPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(setsPath, JSON.stringify({ sets }, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving workout sets:', error);
    res.status(500).json({ error: 'Failed to save workout sets' });
  }
});

// Get default set
app.get('/api/workout/default-set', (req, res) => {
  try {
    const defaultPath = getWorkoutDataPath('default-set');
    if (!fs.existsSync(defaultPath)) {
      return res.json({ setId: null });
    }
    const data = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
    res.json(data);
  } catch (error) {
    console.error('Error loading default set:', error);
    res.status(500).json({ error: 'Failed to load default set' });
  }
});

// Update default set
app.put('/api/workout/default-set', (req, res) => {
  try {
    const { setId } = req.body;
    if (setId !== null && typeof setId !== 'string') {
      return res.status(400).json({ error: 'Invalid setId' });
    }
    
    const defaultPath = getWorkoutDataPath('default-set');
    const dataDir = path.dirname(defaultPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(defaultPath, JSON.stringify({ setId }, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving default set:', error);
    res.status(500).json({ error: 'Failed to save default set' });
  }
});

// Get workout day
app.get('/api/workout/day', (req, res) => {
  try {
    const date = req.query.date as string;
    if (!date) {
      return res.status(400).json({ error: 'Date parameter required' });
    }
    
    const daysPath = getWorkoutDataPath('days');
    if (!fs.existsSync(daysPath)) {
      return res.status(404).json({ error: 'Workout day not found' });
    }
    
    const daysData = JSON.parse(fs.readFileSync(daysPath, 'utf-8'));
    const day = daysData.days?.find((d: any) => d.date === date);
    
    if (!day) {
      return res.status(404).json({ error: 'Workout day not found' });
    }
    
    res.json(day);
  } catch (error) {
    console.error('Error loading workout day:', error);
    res.status(500).json({ error: 'Failed to load workout day' });
  }
});

// Update workout day
app.put('/api/workout/day', (req, res) => {
  try {
    const day: { date: string; sets: string[]; completed?: Record<string, boolean> } = req.body;
    if (!day.date || !Array.isArray(day.sets)) {
      return res.status(400).json({ error: 'Invalid workout day data' });
    }
    
    const daysPath = getWorkoutDataPath('days');
    const dataDir = path.dirname(daysPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    let daysData: { days: any[] } = { days: [] };
    if (fs.existsSync(daysPath)) {
      daysData = JSON.parse(fs.readFileSync(daysPath, 'utf-8'));
    }
    
    const existingIndex = daysData.days.findIndex((d: any) => d.date === day.date);
    if (existingIndex >= 0) {
      daysData.days[existingIndex] = day;
    } else {
      daysData.days.push(day);
    }
    
    fs.writeFileSync(daysPath, JSON.stringify(daysData, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving workout day:', error);
    res.status(500).json({ error: 'Failed to save workout day' });
  }
});

// Get workout streak
app.get('/api/workout/streak', (req, res) => {
  try {
    const daysPath = getWorkoutDataPath('days');
    if (!fs.existsSync(daysPath)) {
      return res.json({ streak: 0 });
    }
    
    const daysData: { days: any[] } = JSON.parse(fs.readFileSync(daysPath, 'utf-8'));
    const days = daysData.days || [];
    
    // Helper to check if a workout day is complete
    const isDayComplete = (day: { date: string; sets: string[]; completed?: Record<string, boolean> }, sets: Array<{ id: string; exercises: string[] }>): boolean => {
      if (!day.completed || Object.keys(day.completed).length === 0) {
        return false;
      }
      
      // Check if all 3 sets are complete
      for (let i = 0; i < 3; i++) {
        const setId = day.sets[i];
        const set = sets.find(s => s.id === setId);
        if (!set) return false;
        
        const allCompleted = set.exercises.every((_: any, idx: number) => day.completed?.[`${i}-${idx}`]);
        if (!allCompleted) return false;
      }
      
      return true;
    };
    
    // Get all sets for reference
    const setsPath = getWorkoutDataPath('sets');
    let sets: Array<{ id: string; exercises: string[] }> = [];
    if (fs.existsSync(setsPath)) {
      const setsData = JSON.parse(fs.readFileSync(setsPath, 'utf-8'));
      sets = setsData.sets || [];
    }
    
    // Calculate streak by checking consecutive days backwards from today
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 365; i++) { // Check up to 365 days back
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];
      
      const day = days.find(d => d.date === dateStr);
      
      if (day && isDayComplete(day, sets)) {
        streak++;
      } else if (i === 0) {
        // Today is not complete, but check if it's in progress (has some completions)
        if (day && day.completed && Object.keys(day.completed).length > 0) {
          // Don't break streak if today is in progress
          continue;
        } else {
          // Today has no completions, streak is 0
          break;
        }
      } else {
        // Found a gap, break the streak
        break;
      }
    }
    
    res.json({ streak });
  } catch (error) {
    console.error('Error calculating workout streak:', error);
    res.json({ streak: 0 });
  }
});

function clientDistIsReady(distDir: string): boolean {
  try {
    return (
      fs.existsSync(distDir) &&
      fs.statSync(distDir).isDirectory() &&
      fs.existsSync(path.join(distDir, 'index.html'))
    );
  } catch {
    return false;
  }
}

// Serve static files from client dist — try cwd + __dirname so Linux portable + dev both work.
function buildClientDistCandidates(): string[] {
  const uniq: string[] = [];
  const add = (p: string) => {
    const r = path.resolve(p);
    if (!uniq.includes(r)) uniq.push(r);
  };

  add(path.join(__dirname, '..', 'client', 'dist'));
  add(path.join(process.cwd(), 'client', 'dist'));
  add(path.join(process.cwd(), 'server-dist', '..', 'client', 'dist'));

  if (process.env.USER_DATA_PATH) {
    const unpackedDir = __dirname;
    const resourcesDir = path.join(unpackedDir, '..', '..');
    add(path.join(resourcesDir, 'app.asar.unpacked', 'client', 'dist'));
    add(path.join(unpackedDir, '..', 'client', 'dist'));
    add(path.join(resourcesDir, 'app.asar', 'client', 'dist'));
  }

  return uniq;
}

const clientCandidates = buildClientDistCandidates();
const picked = clientCandidates.find(clientDistIsReady);
const clientDistPath = picked ?? clientCandidates[0];
let indexHtmlPath = path.join(clientDistPath, 'index.html');
let indexHtmlText: string | null = null;
try {
  if (fs.existsSync(indexHtmlPath)) {
    indexHtmlText = fs.readFileSync(indexHtmlPath, 'utf8');
  }
} catch {
  indexHtmlText = null;
}

console.log('[bct] cwd=%s __dirname=%s', process.cwd(), __dirname);
console.log('[bct] client bundle candidates:', clientCandidates);
console.log('[bct] client bundle:', clientDistIsReady(clientDistPath) ? clientDistPath : `(missing index.html — tried ${clientDistPath})`);
console.log('[bct] index.html:', indexHtmlPath, indexHtmlText ? '(loaded)' : '(not loaded)');

if (clientDistIsReady(clientDistPath)) {
  const staticMw = express.static(clientDistPath, { index: false });

  /** Dedicated URL so browsers do not reuse a cached SPA shell without auth. */
  app.get('/bct-sign-in', async (req, res) => {
    if (!WEB_AUTH && !isPasswordAuthEnabled()) {
      return res.redirect('/');
    }
    const ok = WEB_AUTH ? await isWebAuthenticated(req) : isAuthenticated(req);
    if (ok) {
      return res.redirect('/');
    }
    return WEB_AUTH ? sendWebLoginPage(res) : sendLoginPage(res);
  });

  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    if (!WEB_AUTH && !isPasswordAuthEnabled()) {
      return staticMw(req, res, next);
    }
    const p = req.path;
    const looksLikeStaticFile =
      p.startsWith('/assets/') ||
      /\.(js|css|map|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot)$/i.test(p);
    if (looksLikeStaticFile) {
      const ok = WEB_AUTH ? await isWebAuthenticated(req) : isAuthenticated(req);
      if (!ok) {
        return res.status(401).type('text/plain').send('Unauthorized');
      }
      return staticMw(req, res, next);
    }
    return next();
  });

  // Serve index.html for all routes (SPA routing)
  app.get('*', async (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const authEnabled = WEB_AUTH || isPasswordAuthEnabled();
    const ok = WEB_AUTH ? await isWebAuthenticated(req) : isAuthenticated(req);
    if (authEnabled && !ok) {
      return WEB_AUTH ? sendWebLoginPage(res) : sendLoginPage(res);
    }
    if (authEnabled) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
    if (indexHtmlText !== null) {
      return res.type('html').send(indexHtmlText);
    }
    // Fallback: try all candidates again in case working directory changed unexpectedly.
    const fallback = clientCandidates.find(clientDistIsReady);
    if (fallback) {
      const p = path.join(fallback, 'index.html');
      try {
        indexHtmlText = fs.readFileSync(p, 'utf8');
        indexHtmlPath = p;
        return res.type('html').send(indexHtmlText);
      } catch (e) {
        console.error('Read fallback index failed:', p, e);
      }
    }
    return res
      .status(500)
      .type('text/plain')
      .send('Client index missing. Run: npm run build (builds client/dist/index.html).');
  });
} else {
  console.error(
    'Client bundle not ready (need client/dist with index.html). Run: npm run build',
    '\nExpected at:',
    clientDistPath,
  );
  // Fallback: return error for non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res
        .status(500)
        .type('text/plain')
        .send('Client bundle not built. From the project root run: npm run build  (needs client/dist/index.html)');
    }
  });
}

function isLanIPv4(e: NetworkInterfaceInfo): boolean {
  if (e.internal) return false;
  const f = e.family as string | number;
  return f === 'IPv4' || f === 4;
}

function lanIPv4Addresses(): string[] {
  const nets = os.networkInterfaces();
  const out: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (!isLanIPv4(e)) continue;
      if (!out.includes(e.address)) out.push(e.address);
    }
  }
  return out;
}

/** Helps people use 192.168.x.x on the LAN instead of their ISP public IP (which often times out on Wi-Fi). */
function logLanAccessHints(scheme: 'http' | 'https'): void {
  if (HOST !== '0.0.0.0' && HOST !== '::') return;
  const addrs = lanIPv4Addresses();
  if (addrs.length === 0) return;
  const proto = scheme === 'https' ? 'https' : 'http';
  const pubPort = PORT;
  console.log('');
  console.log('Same Wi-Fi / LAN: on your phone or other computer, use one of these addresses');
  console.log('(do not use your public "what is my IP" address while you are at home on the same network):');
  for (const a of addrs) {
    console.log(`  ${proto}://${a}:${pubPort}`);
  }
  console.log(
    'Reaching this from outside your home needs router TCP port-forward for this port to this machine,',
    'host firewall rules, and an ISP that gives you a real public IP (CGNAT breaks simple port-forwarding).',
  );
  console.log(
    'If your public IP works from mobile data but a 192.168.x.x address times out on Wi-Fi, try: main (non-guest) Wi-Fi,',
    'disable client/AP isolation on the router, turn off VPN on the phone, or use Ethernet.',
  );
  console.log('');
}

function logListenUrl(scheme: 'http' | 'https') {
  console.log(`Server running on http://${HOST}:${PORT}`);
  logLanAccessHints(scheme);
}

if (!process.env.VERCEL) {
  http.createServer(app).listen(PORT, HOST, () => logListenUrl('http'));
}

export default app;
