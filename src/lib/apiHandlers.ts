import { supabase } from './supabaseClient';

const blog_bucket = supabase.storage.from('blog_images');
const profile_picture_bucket = supabase.storage.from('profile_picture');

// ============ AUTH HANDLERS ============

export async function logout() {
  try {
    await supabase.auth.signOut();
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to logout' };
  }
}

// ============ POST HANDLERS ============

export async function getPosts() {
  try {
    const { data: posts, error } = await supabase
      .from('post')
      .select(`
        post_id,
        title, 
        content,
        image,
        created_at,
        comment (
          comment,
          created_at,
          users(
            firstname, lastname, image
          )
        ),
        users (
          firstname, lastname, image
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: 'Something went wrong' };
    }

    return { success: true, posts };
  } catch (error) {
    return { success: false, error: 'Something went wrong' };
  }
}

export async function getPostById(id: string) {
  try {
    const { data: post, error } = await supabase
      .from('post')
      .select(`
        post_id,
        title, 
        content,
        image,
        created_at,
        comment (
          comment,
          created_at,
          users(
            firstname, lastname, image
          )
        ),
        users (
          firstname, lastname, image
        )
      `)
      .eq('post_id', id)
      .single();

    if (error) {
      return { success: false, error: 'Something went wrong' };
    }

    return { success: true, post };
  } catch (error) {
    return { success: false, error: 'Something went wrong' };
  }
}

export async function createPost(
  formData: FormData,
  user: any
) {
  try {
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const title = formData.get('title')?.toString().trim() || '';
    const content = formData.get('content')?.toString().trim() || '';
    const blogImage = formData.get('blog_image');

    if (!title || !content || !blogImage) {
      return { success: false, error: 'All fields are required' };
    }

    const { name, type, size } = blogImage as File;
    const fileExtension = name.split('.').pop();
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];

    if (!allowedTypes.includes(type)) {
      return {
        success: false,
        error: 'Invalid blog image format. Only JPEG, PNG, and GIF are allowed.',
      };
    }

    if (size > 5 * 1024 * 1024) {
      return { success: false, error: 'Blog image size exceeds 5MB.' };
    }

    const uniqueFilename = `${Date.now()}_${name
      .split('.')[0]
      .replace(/\s+/g, '_')}.${fileExtension}`;

    const { error: uploadError } = await blog_bucket.upload(
      uniqueFilename,
      blogImage as Blob,
      {
        contentType: type,
      }
    );

    if (uploadError) {
      return { success: false, error: 'Failed to upload blog image.' };
    }

    const { data: publicUrl } = blog_bucket.getPublicUrl(uniqueFilename);

    const { error: insertError } = await supabase.from('post').insert([
      {
        title,
        content,
        image: publicUrl,
        user_id: user.user_id,
      },
    ]);

    if (insertError) {
      return { success: false, error: 'Failed to create post.' };
    }

    return { success: true, message: 'Post created successfully.' };
  } catch (error) {
    return { success: false, error: 'Server Error, Something went wrong!' };
  }
}

export async function updatePost(
  id: string,
  formData: FormData,
  user: any
) {
  try {
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const title = formData.get('title')?.toString().trim() || '';
    const content = formData.get('content')?.toString().trim() || '';
    const blogImage = formData.get('blog_image');
    const oldImage = formData.get('old_image')?.toString().trim() || '';

    if (!title || !content) {
      return { success: false, error: 'All fields are required' };
    }

    let uploadedImage;

    if (blogImage) {
      const imageToDelete = oldImage.split('blog_images/')[1];
      const { name, type, size } = blogImage as File;
      const fileExtension = name.split('.').pop();
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];

      if (!allowedTypes.includes(type)) {
        return {
          success: false,
          error: 'Invalid blog image format. Only JPEG, PNG, and GIF are allowed.',
        };
      }

      if (size > 5 * 1024 * 1024) {
        return { success: false, error: 'Blog image size exceeds 5MB.' };
      }

      const uniqueFilename = `${Date.now()}_${name
        .split('.')[0]
        .replace(/\s+/g, '_')}.${fileExtension}`;

      const { error: uploadError } = await blog_bucket.upload(
        uniqueFilename,
        blogImage as Blob,
        {
          contentType: type,
        }
      );

      if (uploadError) {
        return { success: false, error: 'Failed to upload blog image.' };
      }

      const { data: publicUrl } = blog_bucket.getPublicUrl(uniqueFilename);
      uploadedImage = publicUrl;

      await supabase
        .storage
        .from('blog_images')
        .remove([imageToDelete]);
    }

    const postPayload: any = {
      title,
      content,
    };

    if (uploadedImage) {
      postPayload.image = uploadedImage;
    }

    const { error: updateError } = await supabase
      .from('post')
      .update(postPayload)
      .eq('post_id', id);

    if (updateError) {
      return { success: false, error: 'Server Error, Something went wrong!' };
    }

    return { success: true, message: 'Post updated successfully.' };
  } catch (error) {
    return { success: false, error: 'Server Error, Something went wrong!' };
  }
}

export async function deletePost(
  id: string,
  user_id: string
) {
  try {
    if (!user_id) {
      return { success: false, error: 'Unauthorized. Please login.' };
    }

    const { error } = await supabase
      .from('post')
      .delete()
      .eq('post_id', id)
      .eq('user_id', user_id);

    if (error) {
      return { success: false, error: 'Error deleting post.' };
    }

    return { success: true, message: 'Post deleted successfully.' };
  } catch (error) {
    return { success: false, error: 'Server Error, Something went wrong!' };
  }
}

// ============ COMMENT HANDLERS ============

export async function createComment(
  formData: FormData
) {
  try {
    const comment = formData.get('comment');
    const post_id = formData.get('post_id');
    const user_id = formData.get('user_id');

    if (!user_id) {
      return { success: false, error: 'Unauthorized. Please login.' };
    }

    if (!comment || !post_id) {
      return {
        success: false,
        error: 'Please provide a comment and post before you submit.',
      };
    }

    const { error } = await supabase
      .from('comment')
      .insert({ comment, post_id, user_id });

    if (error) {
      return { success: false, error: 'Error submitting comment. Try again.' };
    }

    return { success: true, message: 'Comment created successfully.' };
  } catch (error) {
    return { success: false, error: 'Server Error, Something went wrong!' };
  }
}

// ============ AUTH HANDLERS ============

export async function signUp(formData: FormData) {
  try {
    const firstname = formData.get('firstname')?.toString().trim();
    const lastname = formData.get('lastname')?.toString().trim();
    const email = formData.get('email')?.toString().trim();
    const username = formData.get('username')?.toString().trim();
    const password = formData.get('password')?.toString().trim();
    const confirm_password = formData.get('confirm_password')?.toString().trim();
    const profile_picture = formData.get('profile_picture');

    if (
      !firstname ||
      !lastname ||
      !email ||
      !username ||
      !password ||
      !confirm_password ||
      !profile_picture
    ) {
      return { success: false, error: 'All fields are required.' };
    }

    if (password !== confirm_password) {
      return { success: false, error: 'Passwords do not match.' };
    }

    if (password.length < 6) {
      return {
        success: false,
        error: 'Password must be at least 6 characters long.',
      };
    }

    const { name, type, size } = profile_picture as File;
    const fileExtension = name.split('.').pop();
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];

    if (!allowedTypes.includes(type)) {
      return {
        success: false,
        error:
          'Invalid profile picture format. Only JPEG, PNG, and GIF are allowed.',
      };
    }

    if (size > 5 * 1024 * 1024) {
      return { success: false, error: 'Profile picture size exceeds 5MB.' };
    }

    const uniqueFilename = `${Date.now()}_${name
      .split('.')[0]
      .replace(/\s+/g, '_')}.${fileExtension}`;

    const { error: uploadError } = await profile_picture_bucket.upload(
      uniqueFilename,
      profile_picture as Blob,
      {
        contentType: type,
      }
    );

    if (uploadError) {
      return { success: false, error: 'Failed to upload profile picture.' };
    }

    const { data: publicURL } = profile_picture_bucket.getPublicUrl(
      uniqueFilename
    );

    const userPayload = {
      firstname,
      lastname,
      email,
      username,
      image: publicURL,
    };

    const { data: supabaseData, error: supabaseError } =
      await supabase.auth.signUp({
        email: userPayload.email,
        password,
      });

    if (supabaseError) {
      return {
        success: false,
        error: supabaseError.message || 'Failed to register user.',
      };
    }

    if (supabaseData.user) {
      await supabase.from('users').insert([
        {
          user_id: supabaseData.user.id,
          ...userPayload,
        },
      ]);
    } else {
      return { success: false, error: 'User registration failed.' };
    }

    return { success: true, message: 'Registration successful.' };
  } catch (error) {
    return { success: false, error: 'Server Error!' };
  }
}

export async function updateProfile(
  formData: FormData,
  user: any
) {
  try {
    const firstname = formData.get('firstname')?.toString().trim();
    const lastname = formData.get('lastname')?.toString().trim();
    const profile_picture = formData.get('profile_picture');
    const password = formData.get('new_password')?.toString().trim();
    const confirm_password = formData
      .get('confirm_new_password')
      ?.toString()
      .trim();

    let uploadedImage;

    if (password) {
      if (password !== confirm_password) {
        return { success: false, error: 'Passwords do not match.' };
      }

      if (password.length < 6) {
        return {
          success: false,
          error: 'Password must be at least 6 characters long.',
        };
      }

      await supabase.auth.updateUser({
        password,
      });
    } else {
      if (!firstname || !lastname) {
        return {
          success: false,
          error: 'Firstname and Lastname is required.',
        };
      }

      if (profile_picture) {
        const imageToDelete = user.image.publicUrl.split('profile_picture/')[1];

        const { name, type, size } = profile_picture as File;
        const fileExtension = name.split('.').pop();
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];

        if (!allowedTypes.includes(type)) {
          return {
            success: false,
            error:
              'Invalid profile picture format. Only JPEG, PNG, and GIF are allowed.',
          };
        }

        if (size > 5 * 1024 * 1024) {
          return { success: false, error: 'Profile picture size exceeds 5MB.' };
        }

        const uniqueFilename = `${Date.now()}_${name
          .split('.')[0]
          .replace(/\s+/g, '_')}.${fileExtension}`;

        const { error: uploadError } = await profile_picture_bucket.upload(
          uniqueFilename,
          profile_picture as Blob,
          {
            contentType: type,
          }
        );

        if (uploadError) {
          return { success: false, error: 'Failed to upload profile picture.' };
        }

        const { data: publicUrl } = profile_picture_bucket.getPublicUrl(
          uniqueFilename
        );
        uploadedImage = publicUrl;

        await supabase
          .storage
          .from('profile_picture')
          .remove([imageToDelete]);
      }

      const updatePayload: any = {
        firstname,
        lastname,
      };

      if (uploadedImage) {
        updatePayload.image = uploadedImage;
      }

      await supabase
        .from('users')
        .update(updatePayload)
        .eq('user_id', user.user_id);
    }

    return { success: true, message: 'User data updated successfully.' };
  } catch (error) {
    return { success: false, error: 'Server Error, Something went wrong!' };
  }
}
