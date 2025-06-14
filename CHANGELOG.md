# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 🔒 Security
- **CRITICAL**: Removed exposed API keys from .env file that was accidentally committed
- **API Key Exposure**: OpenAI API key and HubSpot token were visible in git history
- **Mitigation**: Removed .env from tracking, added safe .env.example template

### 🧹 Repository Cleanup
- **MASSIVE**: Removed 7,500+ accidentally committed node_modules files from git tracking
- **Repository Size**: Dramatically reduced repository bloat by removing dependency files
- **Performance**: Faster clones, smaller repo size, no more dependency conflicts in git
- **Future Prevention**: .gitignore now properly excludes all node_modules directories

### ✨ Added
- **Repository Setup**: Comprehensive .gitignore file for Node.js/TypeScript monorepo with Turbo build system
- **Build Artifact Management**: Proper exclusion of Turbo cache files, logs, and temporary files

### 🔧 Changed
- **Voice Performance Optimization**: Removed artificial response length limits (max_response_output_tokens) that were cutting off assistant responses
- **Speed Adjustment**: Changed default speech speed from 1.5x to 1.2x for optimal pace - fast but not hurried
- **Configuration Architecture**: Implemented proper default + override pattern for session configuration
- **Centralized Defaults**: Created getDefaultSessionConfig() utility for consistent voice interface settings across all implementations
- **Transcript Ordering Fix**: Eliminated streaming race conditions by collecting complete AI responses before adding to transcript, ensuring perfect chronological order
- **UI Cleanup**: Removed duplicate "Voice chat active" status messages for cleaner interface
- **SSL Configuration**: Added SSL certificate verification bypass for Amazon MCP to handle certificate chain issues
- **Environment Variable Handling**: Improved `env` command approach for cleaner environment variable management

### 🐛 Fixed
- **OpenAI Function Naming Compatibility**: Fixed "Unknown tool" errors caused by underscore-based MCP tool names not being compatible with OpenAI Realtime API
- **HubSpot MCP Integration**: Resolved environment variable loading issues preventing HubSpot provider from showing as available
- **Function Name Mapping**: Implemented bidirectional camelCase conversion (hubspot_list_workflows ↔ hubspotListWorkflows) with proper reverse mapping
- **Environment Variable Loading**: Created .env template file for voice-demo with proper HUBSPOT_TOKEN and other required variables
- **Debug Visibility**: Enhanced error logging with clear function call mapping traces and reduced verbose tool output during connection
- **Transcript Chronological Order**: Tool calls now appear in correct sequence (User → Tool Call → AI Response) instead of interrupting streaming responses
- **JavaScript Syntax Error**: Fixed malformed if-else chain in handleVoiceMessage function
- **Missing Configuration**: Voice demo now properly applies performance optimizations (speed, temperature, turn detection) that were previously ignored

### ✨ Added
- **🎙️ Unified Voice Demo** - Single interface for all MCP providers with dynamic switching
- **🎨 Blender 3D Integration** - Voice-controlled 3D modeling, animation, and rendering capabilities
- **📦 Amazon MCP Integration** - Product search and browsing with voice commands
- Root README.md with simplified API showcase
- Clean examples focusing on WebRTCBridgeServer  
- Comprehensive documentation for browser integration
- Dynamic MCP provider selection with real-time status
- Single .env configuration for all API keys
- Automatic voice chat activation after MCP connection
- Streamlined Connect/Disconnect controls for entire flow

### 🔧 Changed
- **BREAKING**: Made `WebRTCBridgeServer` the primary API in exports
- Updated all documentation to feature WebRTCBridgeServer as main API
- Simplified READY_TO_BEGIN.md to match actual implementation
- Updated core package README with ultra-simple getting started
- Cleaned up HubSpot example to showcase canonical usage pattern
- **UI Simplification**: Removed separate microphone controls - Connect button now handles entire flow
- Auto-start voice chat immediately after MCP provider connection
- Simplified status messaging for clearer user experience
- **Complete UI Redesign**: Modern, minimal design replacing childish bright colors and excessive rounded corners
- **Layout Reorganization**: Moved Connect/Disconnect buttons under provider selection, function calls to right panel
- **Tools Modal**: Available tools moved to clean modal interface accessed via button
- **Function Call Panel**: Real-time function execution display in dedicated right sidebar

### 🗑️ Removed
- **Separate example directories** - Replaced with unified voice demo
- Complex manual implementation examples that didn't use library API
- Redundant bridge implementations in examples
- References to deprecated manual approaches
- **Bright gradient backgrounds** and childish color schemes
- **Connection logs panel** - simplified interface focus
- **Excessive emojis** and rounded design elements
- **Separate microphone controls** - merged into single Connect flow

### 📝 Documentation
- Updated README files across all packages to be consistent
- Added comprehensive configuration documentation
- Improved browser integration examples
- Streamlined example setup instructions

## [0.1.0] - 2024-12-XX

### ✨ Added
- Initial release of Realtime MCP Proxy library
- WebRTCBridgeServer for easy integration
- RealtimeMCPProxy for advanced usage
- Full TypeScript support with comprehensive types
- Working examples for HubSpot, HackerNews, and Airbnb MCP servers
- Browser demo pages for voice interactions
- Automatic MCP server process management
- Ephemeral API key generation for WebRTC
- Health check and status endpoints
- CORS support and graceful shutdown handling

### 🏗️ Technical
- Monorepo structure with packages and examples
- Turbo build system for efficient development
- Comprehensive error handling and timeouts
- Event system for monitoring and debugging
- Support for both HTTP and stdio MCP servers
- Zod validation for configurations 