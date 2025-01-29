import React, { useState, useEffect } from "react";
import { SafeAreaView, ScrollView, Pressable, Alert, ActivityIndicator, Text, View, TouchableOpacity } from "react-native";
import ContactRow from '../components/ContactRow';
import Separator from "../components/Separator";
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { auth, database } from '../config/firebase';
import { collection, doc, where, query, onSnapshot, orderBy, setDoc, deleteDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors } from "../config/constants";
import { StatusBar } from "expo-status-bar";

const Chats = ({ setUnreadCount }) => {
    const navigation = useNavigation();
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedItems, setSelectedItems] = useState([]);
    const [newMessages, setNewMessages] = useState({});

    useFocusEffect(
        React.useCallback(() => {
            const loadNewMessages = async () => {
                try {
                    const storedMessages = await AsyncStorage.getItem('newMessages');
                    const parsedMessages = storedMessages ? JSON.parse(storedMessages) : {};
                    setNewMessages(parsedMessages);
                    setUnreadCount(Object.values(parsedMessages).reduce((total, num) => total + num, 0));
                } catch (error) {
                    console.log('Error loading new messages from storage', error);
                }
            };

            const collectionRef = collection(database, 'chats');
            const q = query(
                collectionRef,
                where('users', "array-contains", { email: auth?.currentUser?.email, name: auth?.currentUser?.displayName, deletedFromChat: false }),
                orderBy("lastUpdated", "desc")
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                setChats(snapshot.docs);
                setLoading(false);

                snapshot.docChanges().forEach(change => {
                    if (change.type === "modified") {
                        const chatId = change.doc.id;
                        const messages = change.doc.data().messages;
                        const firstMessage = messages[0];

                        if (firstMessage.user._id !== auth?.currentUser?.email) {
                            setNewMessages(prev => {
                                const updatedMessages = { ...prev, [chatId]: (prev[chatId] || 0) + 1 };
                                AsyncStorage.setItem('newMessages', JSON.stringify(updatedMessages));
                                setUnreadCount(Object.values(updatedMessages).reduce((total, num) => total + num, 0));
                                return updatedMessages;
                            });
                        }
                    }
                });
            });

            loadNewMessages();

            return () => unsubscribe();
        }, [])
    );

    useEffect(() => {
        updateNavigationOptions();
    }, [selectedItems]);

    const updateNavigationOptions = () => {
        if (selectedItems.length > 0) {
            navigation.setOptions({
                headerRight: () => (
                    <TouchableOpacity className="mr-3" onPress={handleDeleteChat}>
                        <Ionicons name="trash" size={24} color={colors.teal} />
                    </TouchableOpacity>
                ),
                headerLeft: () => (
                    <Text className="ml-24 text-teal-500 text-lg font-medium">{selectedItems.length}</Text>
                ),
            });
        } else {
            navigation.setOptions({
                headerRight: null,
                headerLeft: null,
            });
        }
    };

    const handleChatName = (chat) => {
        const users = chat.data().users;
        const currentUser = auth?.currentUser;

        if (chat.data().groupName) {
            return chat.data().groupName;
        }

        if (currentUser?.displayName) {
            return users[0].name === currentUser.displayName ? users[1].name : users[0].name;
        }

        if (currentUser?.email) {
            return users[0].email === currentUser.email ? users[1].email : users[0].email;
        }

        return '~ No Name or Email ~';
    };

    const handleOnPress = async (chat) => {
        const chatId = chat.id;
        if (selectedItems.length) {
            return selectItems(chat);
        }
        setNewMessages(prev => {
            const updatedMessages = { ...prev, [chatId]: 0 };
            AsyncStorage.setItem('newMessages', JSON.stringify(updatedMessages));
            setUnreadCount(Object.values(updatedMessages).reduce((total, num) => total + num, 0));
            return updatedMessages;
        });
        navigation.navigate('Chat', { id: chat.id, chatName: handleChatName(chat) });
    };

    const handleLongPress = (chat) => {
        selectItems(chat);
    };

    const selectItems = (chat) => {
        if (selectedItems.includes(chat.id)) {
            setSelectedItems(selectedItems.filter(item => item !== chat.id));
        } else {
            setSelectedItems([...selectedItems, chat.id]);
        }
    };

    const getSelected = (chat) => {
        return selectedItems.includes(chat.id);
    };

    const deSelectItems = () => {
        setSelectedItems([]);
    };

    const handleFabPress = () => {
        navigation.navigate('Users');
    };

    const handleDeleteChat = () => {
        Alert.alert(
            selectedItems.length > 1 ? "Delete selected chats?" : "Delete this chat?",
            "Messages will be removed from this device.",
            [
                {
                    text: "Delete chat",
                    onPress: () => {
                        selectedItems.forEach(chatId => {
                            const chat = chats.find(chat => chat.id === chatId);
                            const updatedUsers = chat.data().users.map(user =>
                                user.email === auth?.currentUser?.email
                                    ? { ...user, deletedFromChat: true }
                                    : user
                            );

                            setDoc(doc(database, 'chats', chatId), { users: updatedUsers }, { merge: true });

                            const deletedUsers = updatedUsers.filter(user => user.deletedFromChat).length;
                            if (deletedUsers === updatedUsers.length) {
                                deleteDoc(doc(database, 'chats', chatId));
                            }
                        });
                        deSelectItems();
                    },
                },
                { text: "Cancel" },
            ],
            { cancelable: true }
        );
    };

    const handleSubtitle = (chat) => {
        const message = chat.data().messages[0];
        if (!message) return "No messages yet";

        const isCurrentUser = auth?.currentUser?.email === message.user._id;
        const userName = isCurrentUser ? 'You' : message.user.name.split(' ')[0];
        const messageText = message.image ? 'sent an image' : message.text.length > 20 ? `${message.text.substring(0, 20)}...` : message.text;

        return `${userName}: ${messageText}`;
    };

    const handleSubtitle2 = (chat) => {
        const options = { year: '2-digit', month: 'numeric', day: 'numeric' };
        return new Date(chat.data().lastUpdated).toLocaleDateString(undefined, options);
    };

    return (
        <Pressable className="flex-1" onPress={deSelectItems}>
            {loading ? (
                <ActivityIndicator size='large' className="flex-1 items-center justify-center text-teal-500" />
            ) : (
                <ScrollView>
                    {chats.length === 0 ? (
                       <View className='flex-1 justify-center items-center top-[350px]'>
                       <View className='flex-row items-center'>
                           <Ionicons name="chatbubble-ellipses-sharp" size={24} color='gray' />
                           <Text className='text-lg text-gray-400 ml-2'>Tidak Ada Pesan</Text>
                       </View>
                   </View>
                    ) : (
                        chats.map(chat => (
                            <React.Fragment key={chat.id}>
                                <ContactRow
                                    className={getSelected(chat) ? "bg-gray-200" : ""}
                                    name={handleChatName(chat)}
                                    subtitle={handleSubtitle(chat)}
                                    subtitle2={handleSubtitle2(chat)}
                                    onPress={() => handleOnPress(chat)}
                                    onLongPress={() => handleLongPress(chat)}
                                    selected={getSelected(chat)}
                                    showForwardIcon={false}
                                    newMessageCount={newMessages[chat.id] || 0}
                                />
                            </React.Fragment>
                        ))
                    )}
                    {/* <Separator /> */}
                    {/* <View className='flex-1 justify-center items-center'>
                        <Text className='text-xs m-4'>
                            <Ionicons name="lock-open" size={12} className="text-gray-600" /> Your personal messages are not <Text className='text-teal-500'>end-to-end-encrypted</Text>
                        </Text>
                    </View> */}
                </ScrollView>
            )}
            <TouchableOpacity className="absolute bottom-3 right-3" onPress={handleFabPress}>
                <View className="w-14 h-14 bg-teal-500 rounded-full justify-center items-center">
                    <Ionicons name="chatbox-ellipses" size={24} color={'white'} />
                </View>
            </TouchableOpacity>
            <StatusBar style="auto" />
        </Pressable>
    );
};

export default Chats;
