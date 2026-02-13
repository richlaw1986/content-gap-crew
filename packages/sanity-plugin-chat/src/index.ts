import {definePlugin} from 'sanity'
import {ChatTool} from './ChatTool'
import {ChatIcon} from './ChatIcon'

export const chatTool = definePlugin({
  name: 'agent-studio-chat',
  tools: [
    {
      name: 'chat',
      title: 'Agent Chat',
      component: ChatTool,
      icon: ChatIcon,
    },
  ],
})
